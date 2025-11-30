// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};
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
            // In production, try resource directory first, then fallback to executable directory
            let resource_backend = app_handle
                .path_resolver()
                .resource_dir()
                .map(|dir| dir.join("backend"));
            
            // Fallback: look for backend next to the executable
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|exe| {
                    // Get the parent directory without canonicalizing (which can cause issues on Windows)
                    exe.parent().map(|p| p.to_path_buf())
                })
                .map(|dir| dir.join("backend"));
            
            // Try resource directory first, then executable directory
            if let Some(ref path) = resource_backend {
                if path.exists() {
                    path.clone()
                } else if let Some(ref exe_path) = exe_dir {
                    if exe_path.exists() {
                        exe_path.clone()
                    } else {
                        return Err(format!(
                            "Backend not found. Checked: {} and {}",
                            path.display(),
                            exe_path.display()
                        ));
                    }
                } else {
                    return Err("Failed to determine backend path".to_string());
                }
            } else if let Some(ref exe_path) = exe_dir {
                if exe_path.exists() {
                    exe_path.clone()
                } else {
                    return Err(format!("Backend not found at: {}", exe_path.display()));
                }
            } else {
                return Err("Failed to determine backend path".to_string());
            }
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
                    format!("Node.js not found in PATH. Please install Node.js from https://nodejs.org/ and ensure it's in your system PATH.")
                } else {
                    format!("Node.js runtime not found. Please install Node.js from https://nodejs.org/ and ensure it's in your system PATH. The app requires Node.js to run the backend server.")
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
                "Backend server.js not found at: {}\n\nBackend path: {}\n\nPlease ensure:\n1. The backend folder is bundled with the application\n2. The backend folder contains server.js\n3. Backend dependencies are installed (node_modules folder exists)",
                server_js.display(),
                backend_path.display()
            ));
        }

        // Check if node_modules exists (backend dependencies installed)
        let node_modules = backend_path.join("node_modules");
        if !node_modules.exists() {
            return Err(format!(
                "Backend dependencies not installed. node_modules folder not found at: {}\n\nPlease run 'npm install' in the backend folder before building the application.",
                node_modules.display()
            ));
        }

        // Log paths before moving server_js (convert to absolute paths for logging)
        let backend_path_abs = backend_path.canonicalize()
            .unwrap_or_else(|_| backend_path.clone());
        let server_js_abs = server_js.canonicalize()
            .unwrap_or_else(|_| server_js.clone());
        println!("Starting backend from: {}", backend_path_abs.display());
        println!("Node.js path: {}", node_path.display());
        println!("Server.js path: {}", server_js_abs.display());
        println!("App data dir: {}", app_data_dir.display());

        // Ensure we use absolute paths for the command
        // Convert to string and remove the \\?\ prefix if present (Node.js doesn't like it)
        let backend_path_abs = backend_path.canonicalize()
            .map_err(|e| format!("Failed to canonicalize backend path {}: {}", backend_path.display(), e))?;
        let server_js_abs = server_js.canonicalize()
            .map_err(|e| format!("Failed to canonicalize server.js path {}: {}", server_js.display(), e))?;
        
        // Convert paths to strings and remove \\?\ prefix for Node.js compatibility
        let backend_path_str = backend_path_abs.to_string_lossy().replace("\\\\?\\", "");
        let server_js_str = server_js_abs.to_string_lossy().replace("\\\\?\\", "");

        let mut cmd = Command::new(&node_path);
        // Use the path as a string (Node.js handles Windows paths correctly)
        cmd.arg(&*server_js_str)
            .current_dir(&*backend_path_str)
            .envs(&env_vars)
            .stdout(if cfg!(debug_assertions) {
                Stdio::inherit()
            } else {
                // In production, capture output to a log file
                let log_dir = app_data_dir.join("logs");
                std::fs::create_dir_all(&log_dir).ok();
                let log_path = log_dir.join("backend.log");
                let log_file = std::fs::File::create(&log_path)
                    .map_err(|e| format!("Failed to create log file at {}: {}", log_path.display(), e))?;
                Stdio::from(log_file)
            })
            .stderr(if cfg!(debug_assertions) {
                Stdio::inherit()
            } else {
                // In production, capture errors to the same log file
                let log_dir = app_data_dir.join("logs");
                std::fs::create_dir_all(&log_dir).ok();
                let log_path = log_dir.join("backend.log");
                let log_file = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path)
                    .map_err(|e| format!("Failed to open log file at {}: {}", log_path.display(), e))?;
                Stdio::from(log_file)
            });

        // On Windows, hide the console window in release builds
        #[cfg(windows)]
        if !cfg!(debug_assertions) {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        // Spawn backend process
        println!("Spawning backend process...");
        
        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn backend process: {}. Node path: {}, Backend path: {}", e, node_path.display(), backend_path.display()))?;

        self.child = Some(child);
        println!("Backend process spawned, waiting for health check...");

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
            "Backend failed to start after {} attempts ({} seconds).\n\nPossible causes:\n1. Node.js not installed or not in PATH\n2. Backend dependencies not installed (run 'npm install' in backend folder)\n3. Port {} already in use\n4. Backend server.js has errors\n\nCheck the log file at: {}\\logs\\backend.log",
            max_attempts,
            max_attempts / 2,
            port,
            app_data_dir.display()
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
            let backend = std::sync::Arc::new(std::sync::Mutex::new(BackendProcess::new()));
            let backend_clone = backend.clone();

            // Start backend in a separate thread to avoid blocking UI
            let app_handle_clone = app_handle.clone();
            std::thread::spawn(move || {
                let mut backend_guard = backend_clone.lock().unwrap();
                match backend_guard.start(app_handle_clone.clone()) {
                    Ok(_) => {
                        println!("Backend started successfully");
                        // Emit event to frontend that backend is ready
                        let _ = app_handle_clone.emit_all("backend-ready", ());
                    }
                    Err(e) => {
                        eprintln!("Failed to start backend: {}", e);
                        // Emit error event to frontend
                        let _ = app_handle_clone.emit_all("backend-error", e.clone());
                    }
                }
            });

            // Store backend process in app state
            app.manage(backend);

            // Enable devtools on the main window (for debugging)
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_window("main") {
                window.open_devtools();
            }

            // Handle app exit to stop backend
            let app_handle_clone = app_handle.clone();
            app.handle().listen_global("tauri://close-requested", move |_event| {
                if let Some(state) = app_handle_clone.try_state::<std::sync::Arc<std::sync::Mutex<BackendProcess>>>() {
                    let backend_arc = state.inner();
                    if let Ok(mut backend_guard) = backend_arc.try_lock() {
                        backend_guard.stop();
                    }
                }
                // Allow the app to close
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

