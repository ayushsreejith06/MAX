'use client';

import { useState, useEffect } from 'react';
import { isDesktopApp } from '@/lib/desktopEnv';

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  error: string | null;
  updateInfo: UpdateInfo | null;
}

export function useAutoUpdate() {
  const [status, setStatus] = useState<UpdateStatus>({
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    error: null,
    updateInfo: null,
  });

  const checkForUpdates = async () => {
    if (!isDesktopApp()) {
      return;
    }

    setStatus(prev => ({ ...prev, checking: true, error: null }));

    try {
      // Dynamically import Tauri API only in desktop mode
      // This import is ignored by webpack during build (see next.config.js)
      // @ts-ignore - Tauri API types may not be available during build
      const updaterModule = await import('@tauri-apps/api/updater');
      // @ts-ignore
      const update = await updaterModule.check();

      if (update?.available) {
        setStatus({
          checking: false,
          available: true,
          downloading: false,
          downloaded: false,
          error: null,
          updateInfo: {
            version: update.version || 'Unknown',
            date: update.date,
            body: update.body,
          },
        });
      } else {
        setStatus(prev => ({
          ...prev,
          checking: false,
          available: false,
        }));
      }
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        checking: false,
        error: error instanceof Error ? error.message : 'Failed to check for updates',
      }));
    }
  };

  const downloadUpdate = async () => {
    if (!isDesktopApp() || !status.available) {
      return;
    }

    setStatus(prev => ({ ...prev, downloading: true, error: null }));

    try {
      // This import is ignored by webpack during build (see next.config.js)
      // @ts-ignore - Tauri API types may not be available during build
      const updaterModule = await import('@tauri-apps/api/updater');
      // @ts-ignore
      const update = await updaterModule.check();

      if (update?.available) {
        // @ts-ignore
        await updaterModule.install({
          onEvent: (event: any) => {
            if (event.event === 'DOWNLOADED') {
              setStatus(prev => ({
                ...prev,
                downloading: false,
                downloaded: true,
              }));
            }
          },
        });
      }
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        downloading: false,
        error: error instanceof Error ? error.message : 'Failed to download update',
      }));
    }
  };

  const installUpdate = async () => {
    if (!isDesktopApp() || !status.downloaded) {
      return;
    }

    try {
      // This import is ignored by webpack during build (see next.config.js)
      // @ts-ignore - Tauri API types may not be available during build
      const updaterModule = await import('@tauri-apps/api/updater');
      // @ts-ignore
      await updaterModule.install();
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to install update',
      }));
    }
  };

  // Check for updates on mount (desktop only)
  useEffect(() => {
    if (isDesktopApp()) {
      // Check after a short delay to allow app to initialize
      const timer = setTimeout(() => {
        checkForUpdates();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, []);

  return {
    status,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  };
}

