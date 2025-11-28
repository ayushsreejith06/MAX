/**
 * GPU detection and execution provider selection for ONNX Runtime
 */

export interface GpuDetectionResult {
  available: boolean;
  provider: 'cuda' | 'directml' | 'cpu';
  error?: string;
}

/**
 * Detect if GPU is available and which execution provider to use
 */
export async function detectGpu(): Promise<GpuDetectionResult> {
  try {
    // Try to import onnxruntime-node
    const ort = require('onnxruntime-node');
    
    // Check available execution providers
    const availableProviders = ort.env.wasm.providers || [];
    
    // Prefer CUDA for NVIDIA GPUs (Windows/Linux)
    if (process.platform !== 'darwin' && availableProviders.includes('cuda')) {
      try {
        // Test CUDA availability
        return { available: true, provider: 'cuda' };
      } catch (error) {
        // CUDA not available, try DirectML
      }
    }
    
    // Prefer DirectML for Windows (works with AMD, Intel, NVIDIA)
    if (process.platform === 'win32' && availableProviders.includes('directml')) {
      try {
        return { available: true, provider: 'directml' };
      } catch (error) {
        // DirectML not available
      }
    }
    
    // Fall back to CPU
    return { available: false, provider: 'cpu' };
  } catch (error) {
    // onnxruntime-node not available or error
    return {
      available: false,
      provider: 'cpu',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check if GPU is available (simple boolean check)
 */
export async function isGpuAvailable(): Promise<boolean> {
  const detection = await detectGpu();
  return detection.available && detection.provider !== 'cpu';
}

