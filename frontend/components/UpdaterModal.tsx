'use client';

import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { isDesktopApp } from '@/lib/desktopEnv';
import { useState } from 'react';

export function UpdaterModal() {
  const { status, downloadUpdate, installUpdate } = useAutoUpdate();
  const [isOpen, setIsOpen] = useState(false);

  // Only show in desktop mode
  if (!isDesktopApp()) {
    return null;
  }

  // Auto-open when update is available
  if (status.available && !isOpen) {
    setIsOpen(true);
  }

  if (!isOpen || !status.available) {
    return null;
  }

  const handleUpdateNow = async () => {
    if (status.downloaded) {
      await installUpdate();
    } else {
      await downloadUpdate();
    }
  };

  const handleLater = () => {
    setIsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-900 rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border border-gray-700">
        <h2 className="text-xl font-bold mb-4 text-white">Update Available</h2>
        
        {status.updateInfo && (
          <div className="mb-4">
            <p className="text-gray-300 mb-2">
              A new version is available: <span className="font-semibold text-white">{status.updateInfo.version}</span>
            </p>
            {status.updateInfo.body && (
              <div className="text-sm text-gray-400 mb-4 whitespace-pre-wrap">
                {status.updateInfo.body}
              </div>
            )}
          </div>
        )}

        {status.error && (
          <div className="mb-4 p-3 bg-error-red/20 border border-error-red/50 rounded text-error-red text-sm">
            {status.error}
          </div>
        )}

        {status.downloading && (
          <div className="mb-4">
            <div className="flex items-center space-x-2 text-floral-white/70">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sage-green"></div>
              <span>Downloading update...</span>
            </div>
          </div>
        )}

        {status.downloaded && (
          <div className="mb-4 p-3 bg-sage-green/20 border border-sage-green/50 rounded text-sage-green text-sm">
            Update downloaded. The app will restart to apply the update.
          </div>
        )}

        <div className="flex space-x-3 justify-end">
          <button
            onClick={handleLater}
            disabled={status.downloading || status.downloaded}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Later
          </button>
          <button
            onClick={handleUpdateNow}
            disabled={status.downloading}
            className="px-4 py-2 bg-sky-blue hover:bg-sky-blue/80 disabled:opacity-50 disabled:cursor-not-allowed text-floral-white rounded transition-colors"
          >
            {status.downloaded ? 'Restart Now' : 'Update Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

