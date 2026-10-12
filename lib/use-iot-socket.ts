"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface TelemetryData {
  deviceId: string;
  flowRate: number;
  dispensedMl: number;
  targetMl: number;
  pulseCount?: number;
  weightGrams?: number;
  grossWeight?: number;
  maxWeightLimit?: number;
  currentWeight?: number;
  calFactor?: number;
  containerWeight?: number;
  tareLog?: string;
  scaleLog?: string;
  scaleStatus?: "CONNECTED" | "DISCONNECTED";
  scaleRaw?: number;
  cutOffMode?: "WEIGHT_LOADCELL" | "TIME_FALLBACK" | string;
  isScaleReady?: boolean;
  status: "READY" | "DISPENSING" | "OFFLINE" | "COMPLETED" | "STOPPED_OVERWEIGHT" | "TIMEOUT_CUTOFF";
  transactionId?: string;
}

export interface IoTEvent {
  type: string;
  topic?: string;
  deviceCode?: string;
  eventType?: "status" | "telemetry" | "complete";
  data?: Record<string, unknown> | null;
  timestamp: string;
}

export interface CommandOptions {
  volumeMl?: number;
  knownWeight?: number;
  factor?: number;
  maxWeight?: number;
  deviceId?: string;
}

export function useIoTSocket(customWsUrl?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<"READY" | "DISPENSING" | "OFFLINE">("OFFLINE");
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    deviceId: "DISPENSER-01",
    flowRate: 0,
    dispensedMl: 0,
    targetMl: 0,
    currentWeight: 0,
    weightGrams: 0,
    maxWeightLimit: 2500,
    isScaleReady: false,
    scaleStatus: "DISCONNECTED",
    status: "OFFLINE",
  });
  const [events, setEvents] = useState<IoTEvent[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const connectRef = useRef<() => void>(() => {});

  // Otomatis tentukan URL WebSocket berdasarkan host browser saat ini
  const getResolvedWsUrl = useCallback(() => {
    if (customWsUrl) return customWsUrl;
    if (typeof window !== "undefined") {
      const host = window.location.hostname || "localhost";
      return `ws://${host}:3001`;
    }
    return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
  }, [customWsUrl]);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        return;
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const targetUrl = getResolvedWsUrl();
      const ws = new WebSocket(targetUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === "SYSTEM_STATUS") {
            setMqttConnected(!!payload.mqttConnected);
            if (payload.deviceStatus) {
              setDeviceStatus(payload.deviceStatus);
              setTelemetry((prev) => ({
                ...prev,
                status: payload.deviceStatus,
                ...(payload.telemetry || {}),
                isScaleReady: payload.telemetry?.isScaleReady !== undefined 
                  ? !!payload.telemetry.isScaleReady 
                  : prev.isScaleReady,
              }));
            }
          } else if (payload.type === "MQTT_EVENT") {
            setEvents((prev) => [payload, ...prev.slice(0, 19)]);

            const { eventType, data } = payload;
            if (eventType === "status") {
              const statusVal = data.status === "OFFLINE" ? "OFFLINE" : data.status || "READY";
              setDeviceStatus(statusVal);
              setTelemetry((prev) => ({
                ...prev,
                status: statusVal,
                calFactor: data.calFactor !== undefined ? data.calFactor : prev.calFactor,
                isScaleReady: data.isScaleReady !== undefined ? !!data.isScaleReady : prev.isScaleReady,
                scaleStatus: data.scaleStatus !== undefined ? data.scaleStatus : (data.isScaleReady ? "CONNECTED" : "DISCONNECTED"),
                scaleLog: data.scaleLog !== undefined ? data.scaleLog : prev.scaleLog,
                scaleRaw: data.scaleRaw !== undefined ? data.scaleRaw : prev.scaleRaw,
                maxWeightLimit: data.maxWeightLimit !== undefined ? data.maxWeightLimit : prev.maxWeightLimit,
                currentWeight: data.currentWeight !== undefined ? data.currentWeight : prev.currentWeight,
              }));
            } else if (eventType === "telemetry") {
              if (data.status === "DISPENSING") {
                setDeviceStatus("DISPENSING");
              } else if (data.status === "READY") {
                setDeviceStatus("READY");
              }
              setTelemetry((prev) => ({
                ...prev,
                ...data,
                isScaleReady: data.isScaleReady !== undefined ? !!data.isScaleReady : prev.isScaleReady,
              }));
            } else if (eventType === "complete") {
              setDeviceStatus("READY");
              setTelemetry((prev) => ({
                ...prev,
                dispensedMl: data.dispensedMl || prev.dispensedMl,
                weightGrams: data.weightGrams || prev.weightGrams,
                grossWeight: data.grossWeight || prev.grossWeight,
                status: data.status || "COMPLETED",
              }));
            }
          }
        } catch (e) {
          console.error("Error parsing WS message:", e);
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);
        setMqttConnected(false);
        wsRef.current = null;

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connectRef.current();
          }
        }, 2500);
      };

      ws.onerror = (err) => {
        console.warn("WebSocket status note:", err);
      };
    } catch (e) {
      console.warn("Failed to initiate WebSocket connection:", e);
    }
  }, [getResolvedWsUrl]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Fungsi pengiriman perintah ke ESP32 via WebSocket gateway
  // Fungsi pengiriman perintah ke ESP32 via WebSocket gateway
  const sendCommand = useCallback(
    (
      action: "START" | "STOP" | "TARE" | "CALIBRATE" | "SET_CAL_FACTOR" | "SET_MAX_WEIGHT" | "RESET",
      optionsOrVolume?: number | CommandOptions,
      fallbackDeviceId = "DISPENSER-01"
    ) => {
      let volumeMl = 600;
      let knownWeight: number | undefined;
      let factor: number | undefined;
      let maxWeight: number | undefined;
      let deviceId = fallbackDeviceId;

      if (typeof optionsOrVolume === "number") {
        volumeMl = optionsOrVolume;
      } else if (optionsOrVolume && typeof optionsOrVolume === "object") {
        if (optionsOrVolume.volumeMl !== undefined) volumeMl = optionsOrVolume.volumeMl;
        if (optionsOrVolume.knownWeight !== undefined) knownWeight = optionsOrVolume.knownWeight;
        if (optionsOrVolume.factor !== undefined) factor = optionsOrVolume.factor;
        if (optionsOrVolume.maxWeight !== undefined) maxWeight = optionsOrVolume.maxWeight;
        if (optionsOrVolume.deviceId !== undefined) deviceId = optionsOrVolume.deviceId;
      }

      const payload = JSON.stringify({
        type: "COMMAND",
        deviceId,
        action,
        volumeMl,
        knownWeight,
        factor,
        maxWeight,
      });

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(payload);
        return true;
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(payload);
          }
        }, 300);
        return true;
      }

      console.warn("WebSocket is reconnecting, re-initiating connection...");
      connectRef.current();
      return false;
    },
    []
  );

  // Helper function untuk Tare timbangan manual
  const sendTare = useCallback(
    (deviceId = "DISPENSER-01") => {
      return sendCommand("TARE", { deviceId });
    },
    [sendCommand]
  );

  // Helper function untuk Reset sesi pengisian dan timbangan
  const sendReset = useCallback(
    (deviceId = "DISPENSER-01") => {
      setDeviceStatus("READY");
      setTelemetry((prev) => ({
        ...prev,
        dispensedMl: 0,
        weightGrams: 0,
        targetMl: 0,
        flowRate: 0,
        status: "READY",
        tareLog: "Timbangan & sesi pengisian telah di-reset ke 0.",
      }));
      return sendCommand("RESET", { deviceId });
    },
    [sendCommand]
  );

  // Helper function untuk Kalibrasi dengan bobot acuan
  const sendCalibrate = useCallback(
    (knownWeight: number, deviceId = "DISPENSER-01") => {
      return sendCommand("CALIBRATE", { knownWeight, deviceId });
    },
    [sendCommand]
  );

  // Helper function untuk menetapkan faktor kalibrasi secara eksplisit
  const sendSetCalFactor = useCallback(
    (factor: number, deviceId = "DISPENSER-01") => {
      return sendCommand("SET_CAL_FACTOR", { factor, deviceId });
    },
    [sendCommand]
  );

  // Helper function untuk menetapkan batas beban maksimal keamanan (gram)
  const sendSetMaxWeight = useCallback(
    (maxWeight: number, deviceId = "DISPENSER-01") => {
      return sendCommand("SET_MAX_WEIGHT", { maxWeight, deviceId });
    },
    [sendCommand]
  );

  return {
    isConnected,
    mqttConnected,
    deviceStatus,
    telemetry,
    events,
    sendCommand,
    sendTare,
    sendReset,
    sendCalibrate,
    sendSetCalFactor,
    sendSetMaxWeight,
  };
}
