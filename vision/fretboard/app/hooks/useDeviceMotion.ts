"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface MotionData {
  accel: { x: number; y: number; z: number };
  gyro: { alpha: number; beta: number; gamma: number };
}

/**
 * Streams DeviceMotion data. On iOS Safari, must request permission first.
 */
export function useDeviceMotion() {
  const [motion, setMotion] = useState<MotionData>({
    accel: { x: 0, y: 0, z: 0 },
    gyro: { alpha: 0, beta: 0, gamma: 0 },
  });
  const [permissionGranted, setPermissionGranted] = useState(false);
  const motionRef = useRef(motion);

  const requestPermission = useCallback(async () => {
    // iOS 13+ requires explicit permission request
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DME.requestPermission === "function") {
      try {
        const result = await DME.requestPermission();
        if (result === "granted") {
          setPermissionGranted(true);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }
    // Non-iOS or older browsers: permission not needed
    setPermissionGranted(true);
    return true;
  }, []);

  useEffect(() => {
    if (!permissionGranted) return;

    const handler = (e: DeviceMotionEvent) => {
      const accel = e.accelerationIncludingGravity;
      const rot = e.rotationRate;
      const next: MotionData = {
        accel: {
          x: accel?.x ?? 0,
          y: accel?.y ?? 0,
          z: accel?.z ?? 0,
        },
        gyro: {
          alpha: rot?.alpha ?? 0,
          beta: rot?.beta ?? 0,
          gamma: rot?.gamma ?? 0,
        },
      };
      motionRef.current = next;
      setMotion(next);
    };

    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }, [permissionGranted]);

  return { motion, motionRef, permissionGranted, requestPermission };
}
