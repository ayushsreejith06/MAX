// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};
use std::path::PathBuf;
use std::time::Duration;
use std::thread;
use tauri::Manager;

struct BackendProcess {
    child: Option<std::process::Child>,
}

impl BackendProcess {
    fn new() -> Self {
        Self { child: None }
    }

    fn start(&mut self, app_handle: tauri::AppHandle) -> Result<(), String> {
        // Determine app data directory
        let app_data_dir = if cfg!(debug_assertions) {
            // In dev mode, resolve relative to project root
            let current_dir = std::env::current_dir()
                .map_err(|e| format!("Failed to get current directory: {}", e))?;
            
            // If we're in src-tauri, go up one level to project root
            let project_root = if current_dir.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n == "src-tauri")
                .unwrap_or(false) {
                current_dir.parent()
                    .ok_or_else(|| "Failed to get project root directory".to_string())?
                    .to_path_buf()
            } else {
                current_dir
            };
            
            project_root.join("backend").join("storage")
        } else {
            // In production, use Tauri app data directory
            let config = app_handle.config();
            tauri::api::path::app_data_dir(&*config)
                .ok_or_else(|| "Failed to get app data directory".to_string())?
                .join("data")
        };

        // Ensure directory exists
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;

        // Determine backend port
        let port = std::env::var("MAX_PORT")
            .unwrap_or_else(|_| "4000".to_string())
            .parse::<u16>()
            .unwrap_or(4000);

        // Determine backend path
        let backend_path = if cfg!(debug_assertions) {
            // In dev mode, resolve relative to project root
            // Tauri might run from src-tauri directory, so we need to go up one level
            let current_dir = std::env::current_dir()
                .map_err(|e| format!("Failed to get current directory: {}", e))?;
            
            // If we're in src-tauri, go up one level to project root
            let project_root = if current_dir.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n == "src-tauri")
                .unwrap_or(false) {
                current_dir.parent()
                    .ok_or_else(|| "Failed to get project root directory".to_string())?
                    .to_path_buf()
            } else {
                current_dir
            };
            
            project_root.join("backend")
        } else {
            // In production, backend should be bundled as a resource
            app_handle
                .path_resolver()
                .resource_dir()
                .ok_or_else(|| "Failed to get resource directory".to_string())?
                .join("backend")
        };

        // Find Node.js executable
        let node_exe = if cfg!(target_os = "windows") {
            "node.exe"
        } else {
            "node"
        };

        // Check if node is available
        let node_path = which::which(node_exe)
            .map_err(|_| {
                if cfg!(debug_assertions) {
                    "Node.js not found in PATH. Please install Node.js for development.".to_string()
                } else {
                    "Node.js runtime not found. The app may not be properly bundled.".to_string()
                }
            })?;

        // Set environment variables for backend
        let mut env_vars = std::collections::HashMap::<String, String>::new();
        env_vars.insert("MAX_ENV".to_string(), "desktop".to_string());
        env_vars.insert("MAX_PORT".to_string(), port.to_string());
        env_vars.insert(
            "MAX_APP_DATA_DIR".to_string(),
            app_data_dir.to_string_lossy().to_string(),
        );

        // Build command to start backend
        let server_js = backend_path.join("server.js");
        if !server_js.exists() {
            return Err(format!(
                "Backend server.js not found at: {}",
                server_js.display()
            ));
        }

        let mut cmd = Command::new(&node_path);
        cmd.arg(server_js)
            .current_dir(&backend_path)
            .envs(&env_vars)
            .stdout(if cfg!(debug_assertions) {
                Stdio::inherit()
            } else {
                Stdio::null()
            })
            .stderr(if cfg!(debug_assertions) {
                Stdio::inherit()
            } else {
                Stdio::null()
            });

        // On Windows, hide the console window in release builds
        #[cfg(windows)]
        if !cfg!(debug_assertions) {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        // Spawn backend process
        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn backend process: {}", e))?;

        self.child = Some(child);

        // Wait for backend to be ready
        let backend_url = format!("http://127.0.0.1:{}/health", port);
        let max_attempts = 30;
        let mut attempts = 0;

        while attempts < max_attempts {
            match reqwest::blocking::get(&backend_url) {
                Ok(response) => {
                    if response.status().is_success() {
                        println!("Backend is ready at {}", backend_url);
                        return Ok(());
                    }
                }
                Err(_) => {
                    // Backend not ready yet
                }
            }

            thread::sleep(Duration::from_millis(500));
            attempts += 1;
        }

        Err(format!(
            "Backend failed to start after {} attempts",
            max_attempts
        ))
    }

    fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            #[cfg(unix)]
            {
                let _ = child.kill();
            }
            #[cfg(windows)]
            {
                let _ = child.kill();
            }
            let _ = child.wait();
        }
    }
}

impl Drop for BackendProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            let mut backend = BackendProcess::new();

            // Start backend
            match backend.start(app_handle.clone()) {
                Ok(_) => {
                    println!("Backend started successfully");
                }
                Err(e) => {
                    eprintln!("Failed to start backend: {}", e);
                    // In production, we could show an error dialog here
                    // For now, just log the error
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Backend startup failed: {}", e),
                    )));
                }
            }

            // Store backend process in app state
            app.manage(std::sync::Mutex::new(backend));

            // Handle app exit to stop backend
            let app_handle_clone = app_handle.clone();
            app.handle().listen_global("tauri://close-requested", move |_event| {
                if let Ok(mut backend) = app_handle_clone.state::<std::sync::Mutex<BackendProcess>>().try_lock() {
                    backend.stop();
                }
                // Allow the app to close
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

