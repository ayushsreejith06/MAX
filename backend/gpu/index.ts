/**
 * GPU-accelerated agent model inference using ONNX Runtime
 * Falls back to CPU if GPU is not available
 */

import { AgentModelInput, AgentModelOutput, GpuEngineStatus } from './types';
import { detectGpu } from './detection';

let engineStatus: GpuEngineStatus = {
  available: false,
  provider: 'none',
  initialized: false
};

let session: any = null;

/**
 * Initialize the GPU engine and load the ONNX model
 */
export async function initializeGpuEngine(): Promise<GpuEngineStatus> {
  if (engineStatus.initialized) {
    return engineStatus;
  }

  try {
    // Check if GPU should be used
    const useGpu = process.env.MAX_USE_GPU === 'true';
    
    if (!useGpu) {
      engineStatus = {
        available: false,
        provider: 'cpu',
        initialized: true
      };
      return engineStatus;
    }

    // Detect GPU availability
    const detection = await detectGpu();
    
    if (!detection.available && detection.provider === 'cpu') {
      console.warn('GPU not available, falling back to CPU inference');
      engineStatus = {
        available: false,
        provider: 'cpu',
        initialized: true
      };
      return engineStatus;
    }

    // Try to load ONNX Runtime
    let ort;
    try {
      ort = require('onnxruntime-node');
    } catch (error) {
      console.warn('onnxruntime-node not available, GPU inference disabled');
      engineStatus = {
        available: false,
        provider: 'cpu',
        initialized: true,
        error: 'onnxruntime-node not installed'
      };
      return engineStatus;
    }

    // Configure execution providers
    const executionProviders: string[] = [];
    if (detection.provider === 'cuda') {
      executionProviders.push('cuda');
    } else if (detection.provider === 'directml') {
      executionProviders.push('directml');
    }
    executionProviders.push('cpu'); // Always include CPU as fallback

    // Load model (if model file exists)
    // For now, we'll create a placeholder session
    // In production, you would load an actual ONNX model file
    const modelPath = require('path').join(__dirname, 'models', 'agent_policy.onnx');
    const fs = require('fs');
    
    if (!fs.existsSync(modelPath)) {
      console.warn(`Model file not found at ${modelPath}, GPU inference disabled`);
      engineStatus = {
        available: false,
        provider: 'cpu',
        initialized: true,
        error: 'Model file not found'
      };
      return engineStatus;
    }

    // Create inference session
    const sessionOptions: any = {
      executionProviders,
      graphOptimizationLevel: 'all'
    };

    session = await ort.InferenceSession.create(modelPath, sessionOptions);
    
    engineStatus = {
      available: detection.available,
      provider: detection.provider,
      initialized: true
    };

    console.log(`GPU engine initialized with provider: ${detection.provider}`);
    return engineStatus;
  } catch (error) {
    console.error('Failed to initialize GPU engine:', error);
    engineStatus = {
      available: false,
      provider: 'cpu',
      initialized: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    return engineStatus;
  }
}

/**
 * Run agent model inference
 */
export async function runAgentModel(input: AgentModelInput): Promise<AgentModelOutput> {
  // Ensure engine is initialized
  if (!engineStatus.initialized) {
    await initializeGpuEngine();
  }

  // If GPU is not available or session is null, use CPU fallback logic
  if (!engineStatus.available || !session) {
    return runCpuFallback(input);
  }

  try {
    // Prepare input tensor
    const ort = require('onnxruntime-node');
    
    // Flatten input features into a single array
    const features = [
      ...input.sectorFeatures,
      ...input.priceHistory.slice(-10), // Last 10 price points
      input.agentState.riskTolerance,
      input.agentState.decisionStyle,
      input.agentState.currentPosition,
      input.agentState.performance,
      input.marketContext.volatility,
      input.marketContext.trend,
      input.marketContext.volume
    ];

    // Create tensor (adjust shape based on your model)
    const tensor = new ort.Tensor('float32', Float32Array.from(features), [1, features.length]);

    // Run inference
    const feeds = { input: tensor };
    const results = await session.run(feeds);

    // Extract outputs (adjust based on your model output structure)
    const output = results.output;
    const outputData = Array.from(output.data);

    // Parse output into AgentModelOutput format
    // This is a placeholder - adjust based on your actual model output
    const actionLogits = outputData.slice(0, 3); // Assuming 3 actions
    const riskScore = outputData[3] || 0.5;
    const confidence = outputData[4] || 0.5;
    const recommendedAction = actionLogits.indexOf(Math.max(...actionLogits));

    return {
      actionLogits,
      riskScore: Math.max(0, Math.min(1, riskScore)),
      confidence: Math.max(0, Math.min(1, confidence)),
      recommendedAction
    };
  } catch (error) {
    console.error('GPU inference failed, falling back to CPU:', error);
    return runCpuFallback(input);
  }
}

/**
 * CPU fallback inference using simple rule-based logic
 */
function runCpuFallback(input: AgentModelInput): AgentModelOutput {
  // Simple rule-based decision making as fallback
  const { agentState, marketContext } = input;
  
  // Calculate action probabilities based on simple rules
  const buyScore = agentState.riskTolerance * marketContext.trend;
  const sellScore = (1 - agentState.riskTolerance) * (1 - marketContext.trend);
  const holdScore = 1 - Math.abs(marketContext.trend);

  const actionLogits = [buyScore, holdScore, sellScore];
  const sum = actionLogits.reduce((a, b) => a + b, 0);
  const normalizedLogits = actionLogits.map(v => v / sum);

  const recommendedAction = normalizedLogits.indexOf(Math.max(...normalizedLogits));
  const riskScore = agentState.riskTolerance * marketContext.volatility;
  const confidence = Math.abs(marketContext.trend);

  return {
    actionLogits: normalizedLogits,
    riskScore: Math.max(0, Math.min(1, riskScore)),
    confidence: Math.max(0, Math.min(1, confidence)),
    recommendedAction
  };
}

/**
 * Get current GPU engine status
 */
export function getGpuEngineStatus(): GpuEngineStatus {
  return { ...engineStatus };
}

