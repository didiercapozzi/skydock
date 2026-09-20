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

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
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
fn resources(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .resource_dir()
        .map(|dir| dir.join("resources"))
        .unwrap_or_else(|_| PathBuf::from("resources"))
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
    /* the bin sits with the work, so a camera's files move onto the same disk rather than across one */
    told.insert(
        "SKYDOCK_TRASH_DIR".into(),
        output_dir.join(".trash").to_string_lossy().into_owned(),
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

/// The window, once the server behind it answers. Made here rather than at startup so nobody is
/// shown an error page for the second it takes the server to come up.
fn show_board(app: &tauri::AppHandle, port: u16) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let address = format!("http://127.0.0.1:{port}");
        match tauri::Url::parse(&address) {
            Ok(parsed) => {
                let built = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(parsed))
                    .title("SkyDock")
                    .inner_size(1440.0, 900.0)
                    .min_inner_size(900.0, 600.0)
                    .build();
                if let Err(e) = built {
                    eprintln!("[SkyDock] the window could not be opened: {e}");
                }
            }
            Err(e) => eprintln!("[SkyDock] {address} is not an address: {e}"),
        }
    });
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
                    if !shown {
                        if let Ok(port) = port.trim().parse::<u16>() {
                            shown = true;
                            show_board(&app, port);
                        }
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
            /* off the main thread: it asks for the work folder, which is a dialog to wait on */
            tauri::async_runtime::spawn(start_server(handle));
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
