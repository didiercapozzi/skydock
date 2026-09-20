// A window, not a terminal: on Windows the console that would otherwise open behind the app is not
// wanted, except while developing, where what the server prints is the only way to see it work.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    skydock_lib::run()
}
