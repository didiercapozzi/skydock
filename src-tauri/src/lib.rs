//! SkyDock as an installed app.
//!
//! The app itself is the same web app the development server runs. This starts it: the SkyDock
//! server, as a program of its own beside the window, on a port nobody else is using and reachable
//! only from this machine. The window is a browser pointed at it. Everything the app does — reading
//! a camera, cutting a clip, making a montage, sending a film to the storage — happens in there.
//!
//! What this side is responsible for: where the work is kept, where the media tools are, and that
//! nothing is left running when the window is closed.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{DragDropEvent, Manager, RunEvent, WebviewEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// The server running behind the window, so that closing the app closes it too. Tauri does not do
/// this by itself, and a server left behind holds the port and goes on working on nothing.
struct Server(Mutex<Option<CommandChild>>);

/// A program shipped with the app sits beside the app's own, whatever the system, and carries
/// SkyDock's name so that nothing of the machine's own is ever installed over.
fn beside_exe(name: &str) -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let here = exe.parent()?;
    let called = if cfg!(windows) {
        format!("skydock-{name}.exe")
    } else {
        format!("skydock-{name}")
    };
    let target = here.join(called);
    target.exists().then_some(target)
}

/// Where the app's own files are: the server, the built page, the templates it ships with.
///
/// Installed, they are where the installer put them. Built and then run where it was built — which
/// is how the app is tried on a machine before anything is installed on it — they are beside the
/// program, since that is where the build left them. Asking only the first is a program that starts
/// and then cannot find its own server.
fn resources(app: &tauri::AppHandle) -> PathBuf {
    let installed = app.path().resource_dir().map(|dir| dir.join("resources")).ok();
    let beside = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("resources")));
    for somewhere in [installed.clone(), beside] {
        match somewhere {
            Some(dir) if dir.is_dir() => return dir,
            _ => {}
        }
    }
    /* neither is there: the installed place is the one worth naming in what goes wrong */
    installed.unwrap_or_else(|| PathBuf::from("resources"))
}

/// The folder SkyDock offers on its first run: the machine's videos folder, with a folder of its
/// own in it, so the footage lands where somebody would look for it.
fn suggested_work_folder(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .video_dir()
        .or_else(|_| app.path().home_dir())
        .map(|dir| dir.join("SkyDock"))
        .unwrap_or_else(|_| PathBuf::from("SkyDock"))
}

/// What the app was told last time, if it has been told.
fn remembered_work_folder(config_dir: &Path) -> Option<PathBuf> {
    let text = std::fs::read_to_string(config_dir.join("settings.json")).ok()?;
    let settings: serde_json::Value = serde_json::from_str(&text).ok()?;
    let told = settings.get("outputDir")?.as_str()?;
    (!told.is_empty()).then(|| PathBuf::from(told))
}

/// Where the work lives. Asked for once, the first time the app is opened, because it is a dropzone's
/// whole season of footage and nobody should find out afterwards that it went somewhere surprising.
/// Answered once and never asked again — the server writes it down. Not answering is an answer too:
/// the suggested folder is used, and it can be moved later.
///
/// Must not be called on the main thread: the dialog is shown there, and waited for here.
fn work_folder(app: &tauri::AppHandle, config_dir: &Path) -> PathBuf {
    if let Some(remembered) = remembered_work_folder(config_dir) {
        return remembered;
    }
    let suggested = suggested_work_folder(app);
    let _ = std::fs::create_dir_all(&suggested);
    app.dialog()
        .file()
        .set_title("Where should SkyDock keep its work?")
        .set_directory(&suggested)
        .blocking_pick_folder()
        .and_then(|picked| picked.into_path().ok())
        .unwrap_or(suggested)
}

/// What the server is told before it starts: where to work, where its settings and its bin are, and
/// where the tools it runs are, since a packaged app carries its own and must not go looking for
/// somebody else's.
fn settings_for(app: &tauri::AppHandle, config_dir: &Path, output_dir: &Path) -> HashMap<String, String> {
    let mut told = HashMap::new();
    /* the server ends when this app does, however this app ends */
    told.insert("SKYDOCK_STOP_WITH_PARENT".into(), "1".into());
    told.insert(
        "SKYDOCK_OUTPUT_DIR".into(),
        output_dir.to_string_lossy().into_owned(),
    );
    told.insert(
        "SKYDOCK_CONFIG_DIR".into(),
        config_dir.to_string_lossy().into_owned(),
    );
    let resources = resources(app);
    told.insert(
        "SKYDOCK_CLIENT_DIR".into(),
        resources.join("client").to_string_lossy().into_owned(),
    );
    told.insert(
        "SKYDOCK_TEMPLATES_DIR".into(),
        resources.join("templates").to_string_lossy().into_owned(),
    );
    for (tool, variable) in [
        ("ffmpeg", "SKYDOCK_FFMPEG_PATH"),
        ("ffprobe", "SKYDOCK_FFPROBE_PATH"),
        ("exiftool", "SKYDOCK_EXIFTOOL_PATH"),
    ] {
        if let Some(found) = beside_exe(tool) {
            told.insert(variable.into(), found.to_string_lossy().into_owned());
        }
    }
    told
}

/// How big the window draws everything. The board is laid out for the machine it is edited on, and
/// the machine in the packing hall is across the room from whoever is reading it, so the whole of
/// it scales — text, thumbnails and all — the way a browser's own zoom does.
///
/// `SKYDOCK_ZOOM` for a moment, `zoom` in the settings for always. Said either as a factor (`1.5`)
/// or as the percentage anybody would say out loud (`150`). Anything outside half to triple size is
/// somebody's slip, and is left at as-drawn.
fn zoom_level(app: &tauri::AppHandle) -> f64 {
    let remembered = || -> Option<f64> {
        let config_dir = app.path().app_config_dir().ok()?;
        let text = std::fs::read_to_string(config_dir.join("settings.json")).ok()?;
        let settings: serde_json::Value = serde_json::from_str(&text).ok()?;
        settings.get("zoom")?.as_f64()
    };
    let told = std::env::var("SKYDOCK_ZOOM")
        .ok()
        .and_then(|said| said.trim().parse::<f64>().ok())
        .or_else(remembered);
    let asked = match told {
        Some(said) if said > 5.0 => said / 100.0,
        Some(said) => said,
        None => 1.0,
    };
    if (0.5..=3.0).contains(&asked) {
        asked
    } else {
        eprintln!("[SkyDock] {asked} is not a size to draw at — showing it as it is.");
        1.0
    }
}

/// The window itself.
///
/// Called from a thread of its own, never from the app's own — making a window is a request to the
/// app's loop and waits for it to be served, and a wait like that on the loop's own thread is a
/// wait for itself. On Linux it simply hangs: the window is made and nothing comes back.
fn open_window(app: &tauri::AppHandle, address: &str) {
    let parsed = match tauri::Url::parse(address) {
        Ok(parsed) => parsed,
        Err(e) => {
            eprintln!("[SkyDock] {address} is not an address: {e}");
            return;
        }
    };
    let built = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
        .title("SkyDock")
        .inner_size(1440.0, 900.0)
        .min_inner_size(900.0, 600.0)
        // ⌘/ctrl with + or −, and the wheel, as they do in any browser.
        .zoom_hotkeys_enabled(true)
        // So the board knows it is in here, and leaves a dropped file to the app rather than to the
        // engine, which will not say what was dropped.
        .initialization_script("window.__skydockDrops = true")
        .build();
    match built {
        Ok(window) => {
            let zoom = zoom_level(app);
            if zoom != 1.0 {
                let _ = window.set_zoom(zoom);
            }
            hand_drops_to_page(&window, zoom);
            println!("[SkyDock] the window is open on {address}");
        }
        Err(e) => eprintln!("[SkyDock] the window could not be opened: {e}"),
    }
}

/// What was dropped on the window, handed to the board.
///
/// A video dragged in from the machine is the board's to file, and the board is a page. The engine
/// the window draws with tells that page a file was dropped and then refuses to say which: it
/// offers the address and hands over nothing at all, because a page is not somebody to trust with
/// where a person's files are. The app is. The drop arrives here with the paths themselves, and
/// this passes them in, with where on the board they were let go, for the board to file them as it
/// files a drop in any browser.
///
/// The page measures in its own pixels: the drop is said in the screen's, so it is brought back
/// through what the screen is drawn at and what the window is zoomed to.
fn hand_drops_to_page(window: &tauri::WebviewWindow, zoom: f64) {
    let handle = window.clone();
    window.on_webview_event(move |event| {
        let WebviewEvent::DragDrop(drag) = event else {
            return;
        };
        /* Said out loud, because a drag that never arrives and one that arrives empty look the
           same from the board: nothing happens either way. */
        match drag {
            DragDropEvent::Enter { paths, position } => {
                println!("[SkyDock] a drag came in with {} path(s) at {position:?}", paths.len())
            }
            DragDropEvent::Leave => println!("[SkyDock] the drag left"),
            DragDropEvent::Drop { paths, position } => {
                println!("[SkyDock] {} path(s) dropped at {position:?}", paths.len())
            }
            _ => {}
        }
        let DragDropEvent::Drop { paths, position } = drag else {
            return;
        };
        let told: Vec<String> = paths
            .iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect();
        let said = serde_json::to_string(&told).unwrap_or_else(|_| "[]".into());
        let scale = handle.scale_factor().unwrap_or(1.0) * zoom;
        let (x, y) = (position.x / scale, position.y / scale);
        let _ = handle.eval(format!(
            "window.dispatchEvent(new CustomEvent('skydock:drop',{{detail:{{paths:{said},x:{x},y:{y}}}}}))"
        ));
    });
}

/// A server already running, for working on the app itself: the development server is told where to
/// keep its work and which editor to open, and this shows what it serves rather than starting a
/// second one of its own.
fn told_where() -> Option<String> {
    let told = std::env::var("SKYDOCK_DEV_URL").ok()?;
    let told = told.trim().to_string();
    (!told.is_empty()).then_some(told)
}

/// Starts the server and waits for it to say which port it is on. Its own output is passed through,
/// because when something goes wrong in there this is the only place it is said.
async fn start_server(app: tauri::AppHandle) {
    let config_dir = match app.path().app_config_dir() {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("[SkyDock] there is nowhere to keep the settings: {e}");
            return;
        }
    };
    let _ = std::fs::create_dir_all(&config_dir);
    let output_dir = work_folder(&app, &config_dir);
    let _ = std::fs::create_dir_all(&output_dir);

    let server = resources(&app).join("skydock-server.mjs");
    let spawned = app
        .shell()
        .sidecar("skydock-node")
        .map(|command| {
            command
                .args([server.to_string_lossy().into_owned()])
                .envs(settings_for(&app, &config_dir, &output_dir))
        })
        .and_then(|command| command.spawn());

    let (mut events, child) = match spawned {
        Ok(running) => running,
        Err(e) => {
            eprintln!("[SkyDock] the server could not be started: {e}");
            return;
        }
    };
    app.state::<Server>().0.lock().unwrap().replace(child);

    let mut shown = false;
    while let Some(event) = events.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let said = String::from_utf8_lossy(&line).trim().to_string();
                println!("{said}");
                if let Some(port) = said.strip_prefix("SKYDOCK_READY ") {
                    if !shown && port.trim().parse::<u16>().is_ok() {
                        shown = true;
                        open_window(&app, &format!("http://127.0.0.1:{}", port.trim()));
                    }
                }
            }
            CommandEvent::Stderr(line) => {
                eprintln!("{}", String::from_utf8_lossy(&line).trim());
            }
            CommandEvent::Terminated(ended) => {
                eprintln!("[SkyDock] the server stopped: {ended:?}");
                break;
            }
            _ => {}
        }
    }
}

/// Stops the server, whatever brought the app to an end.
fn stop_server(app: &tauri::AppHandle) {
    if let Some(child) = app.state::<Server>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
}

pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init());

    /* One SkyDock at a time: a second one would fight the first over the same folder and the same
       camera, so opening it again brings the window already there to the front. */
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .manage(Server(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            /* Off this thread, both of them: starting the server asks for the work folder, which is
               a dialog to wait on, and the window itself is made from a thread the app's loop can
               serve. */
            tauri::async_runtime::spawn(async move {
                match told_where() {
                    Some(address) => {
                        println!("[SkyDock] showing the server already running at {address}");
                        open_window(&handle, &address);
                    }
                    None => start_server(handle).await,
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("SkyDock could not start")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                stop_server(app);
            }
        });
}
