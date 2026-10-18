"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface TelemetryData {
  deviceId: string;
  flowRate: number; // L/min
  flowRateMlPerSec?: number; // mL/s
  dispensedMl: number;
  targetMl: number;
  pulseCount?: number;
  status: "READY" | "DISPENSING" | "OFFLINE" | "COMPLETED" | "TIMEOUT_CUTOFF";
  transactionId?: string;
  isTumblerPresent?: boolean;
  buzzerAlarmEnabled?: boolean;
  isBuzzerSounding?: boolean;
  targetDistanceCm?: number;
  currentDistanceCm?: number;
  rawSensorSignal?: number;
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
  flowRate?: number;
  targetMl?: number;
  measuredMl?: number;
  deviceId?: string;
  enabled?: boolean;
  targetDistanceCm?: number;
  activeHigh?: boolean;
  count?: number;
  [key: string]: unknown;
}

export function useIoTSocket(customWsUrl?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<"READY" | "DISPENSING" | "OFFLINE">("OFFLINE");
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    deviceId: "DISPENSER-01",
    flowRate: 1.5,
    flowRateMlPerSec: 25.0,
    dispensedMl: 0,
    targetMl: 0,
    status: "OFFLINE",
  });
  const [events, setEvents] = useState<IoTEvent[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const connectRef = useRef<() => void>(() => {});

  // Otomatis tentukan URL WebSocket:
  // 1. customWsUrl jika diberikan
  // 2. NEXT_PUBLIC_WS_URL jika didefinisikan (misal wss://ws-water.domainanda.com)
  // 3. Fallback cerdas berdasarkan window.location (wss:// jika https, ws:// jika http)
  const getResolvedWsUrl = useCallback(() => {
    if (customWsUrl) return customWsUrl;
    if (process.env.NEXT_PUBLIC_WS_URL && process.env.NEXT_PUBLIC_WS_URL.trim() !== "") {
      return process.env.NEXT_PUBLIC_WS_URL;
    }
    if (typeof window !== "undefined") {
      const isHttps = window.location.protocol === "https:";
      const protocol = isHttps ? "wss:" : "ws:";
      const host = window.location.hostname || "localhost";
      return `${protocol}//${host}:3002`;
    }
    return "ws://localhost:3002";
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
              }));
            }
          } else if (payload.type === "MQTT_EVENT") {
            setEvents((prev) => [payload, ...prev.slice(0, 19)]);

            const { eventType, data } = payload;
            if (eventType === "status") {
              const statusVal = data?.status === "OFFLINE" ? "OFFLINE" : (data?.status as TelemetryData["status"]) || "READY";
              setDeviceStatus(statusVal === "DISPENSING" ? "DISPENSING" : statusVal === "OFFLINE" ? "OFFLINE" : "READY");
              setTelemetry((prev) => ({
                ...prev,
                status: statusVal,
              }));
            } else if (eventType === "telemetry") {
              if (data?.status === "DISPENSING") {
                setDeviceStatus("DISPENSING");
              } else if (data?.status === "READY") {
                setDeviceStatus("READY");
              }
              setTelemetry((prev) => ({
                ...prev,
                ...(data as Partial<TelemetryData>),
              }));
            } else if (eventType === "complete") {
              setDeviceStatus("READY");
              setTelemetry((prev) => ({
                ...prev,
                dispensedMl: typeof data?.dispensedMl === "number" ? data.dispensedMl : prev.dispensedMl,
                status: (data?.status as TelemetryData["status"]) || "COMPLETED",
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
  const sendCommand = useCallback(
    (
      action:
        | "START"
        | "STOP"
        | "TARE"
        | "CALIBRATE"
        | "SET_CAL_FACTOR"
        | "SET_MAX_WEIGHT"
        | "RESET"
        | "SHOW_MENU"
        | "SET_BUZZER_ALARM"
        | "RESET_SENSOR"
        | "SET_PROXIMITY_CONFIG"
        | "TEST_BUZZER"
        | string,
      optionsOrVolume?: number | CommandOptions,
      fallbackDeviceId = "DISPENSER-01"
    ) => {
      let volumeMl = 600;
      let deviceId = fallbackDeviceId;
      let extraOptions: Record<string, unknown> = {};

      if (typeof optionsOrVolume === "number") {
        volumeMl = optionsOrVolume;
      } else if (optionsOrVolume && typeof optionsOrVolume === "object") {
        extraOptions = { ...optionsOrVolume };
        if (optionsOrVolume.volumeMl !== undefined) volumeMl = optionsOrVolume.volumeMl;
        if (optionsOrVolume.deviceId !== undefined) deviceId = optionsOrVolume.deviceId;
      }

      const payload = JSON.stringify({
        type: "COMMAND",
        ...extraOptions,
        deviceId,
        action,
        volumeMl,
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

  // Helper function untuk Reset sesi pengisian
  const sendReset = useCallback(
    (deviceId = "DISPENSER-01") => {
      setDeviceStatus("READY");
      setTelemetry((prev) => ({
        ...prev,
        dispensedMl: 0,
        targetMl: 0,
        flowRate: 0,
        status: "READY",
      }));
      return sendCommand("RESET", { deviceId });
    },
    [sendCommand]
  );

  // Helper function untuk Mengaktifkan / Menonaktifkan Alarm Buzzer
  const sendSetBuzzerAlarm = useCallback(
    (enabled: boolean, deviceId = "DISPENSER-01") => {
      setTelemetry((prev) => ({ ...prev, buzzerAlarmEnabled: enabled }));
      return sendCommand("SET_BUZZER_ALARM", { enabled, deviceId });
    },
    [sendCommand]
  );

  // Helper function untuk Mereset Sensor E18-B03P1
  const sendResetSensor = useCallback(
    (deviceId = "DISPENSER-01") => {
      return sendCommand("RESET_SENSOR", { deviceId });
    },
    [sendCommand]
  );

  // Helper function untuk Konfigurasi Jarak (cm) dan Polaritas Sensor E18-B03P1
  const sendSetProximityConfig = useCallback(
    (targetDistanceCm: number, activeHigh: boolean, deviceId = "DISPENSER-01") => {
      setTelemetry((prev) => ({ ...prev, targetDistanceCm }));
      return sendCommand("SET_PROXIMITY_CONFIG", { targetDistanceCm, activeHigh, deviceId });
    },
    [sendCommand]
  );

  // Helper function untuk Uji Bunyi Buzzer
  const sendTestBuzzer = useCallback(
    (count = 1, deviceId = "DISPENSER-01") => {
      return sendCommand("TEST_BUZZER", { count, deviceId });
    },
    [sendCommand]
  );

  // Helper function untuk Menetapkan Debit Pompa Dinamis (mL/detik)
  const sendSetFlowRate = useCallback(
    (flowRate: number, deviceId = "DISPENSER-01") => {
      setTelemetry((prev) => ({
        ...prev,
        flowRateMlPerSec: flowRate,
        flowRate: (flowRate * 60) / 1000,
      }));
      return sendCommand("SET_FLOW_RATE", { flowRate, deviceId });
    },
    [sendCommand]
  );

  // Helper function untuk Kalibrasi Debit Berdasarkan Takaran Riil (Gelas Ukur)
  const sendCalibratePump = useCallback(
    (targetMl: number, measuredMl: number, deviceId = "DISPENSER-01") => {
      return sendCommand("CALIBRATE_PUMP", { targetMl, measuredMl, deviceId });
    },
    [sendCommand]
  );

  // Helper function untuk Mereset Pengaturan Wi-Fi ESP32
  const sendResetWiFi = useCallback(
    (deviceId = "DISPENSER-01") => {
      return sendCommand("RESET_WIFI", { deviceId });
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
    sendReset,
    sendSetBuzzerAlarm,
    sendResetSensor,
    sendSetProximityConfig,
    sendTestBuzzer,
    sendSetFlowRate,
    sendCalibratePump,
    sendResetWiFi,
  };
}
