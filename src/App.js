import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, isValid } from 'date-fns';
import './App.css';

function App() {
  const STORAGE_KEY = 'turbine_data';
  const MAX_DATA_POINTS = 50;

  // Initialize state with data from localStorage
  const getInitialState = () => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        return {
          messages: parsedData.messages || [],
          faults: parsedData.faults || [],
          latestMessage: parsedData.latestMessage || null,
          connectionStatus: 'connecting'
        };
      }
    } catch (error) {
      console.error('Error loading data from localStorage:', error);
    }
    return {
      messages: [],
      faults: [],
      latestMessage: null,
      connectionStatus: 'connecting'
    };
  };

  const [messages, setMessages] = useState(getInitialState().messages);
  const [faults, setFaults] = useState(getInitialState().faults);
  const [latestMessage, setLatestMessage] = useState(getInitialState().latestMessage);
  const [connectionStatus, setConnectionStatus] = useState(getInitialState().connectionStatus);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    const dataToSave = {
      messages,
      faults,
      latestMessage
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Error saving data to localStorage:', error);
      // If storage is full, remove oldest messages
      if (error.name === 'QuotaExceededError') {
        const reducedMessages = messages.slice(-MAX_DATA_POINTS);
        const reducedFaults = faults.slice(-MAX_DATA_POINTS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          messages: reducedMessages,
          faults: reducedFaults,
          latestMessage
        }));
      }
    }
  }, [messages, faults, latestMessage]);

  const formatTimestamp = (timestamp) => {
    try {
      const date = new Date(timestamp);
      if (!isValid(date)) return '--';
      return format(date, 'HH:mm:ss');
    } catch (error) {
      console.error('Timestamp formatting error:', error);
      return '--';
    }
  };

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:1880/ws/dashboard');

    ws.onopen = () => {
      console.log('WebSocket connection established');
      setConnectionStatus('connected');
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      setConnectionStatus('disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
    };

    ws.onmessage = (event) => {
      try {
        const rawData = JSON.parse(event.data);
        console.log('Received raw data:', rawData);

        const data = rawData.t;  // Original sensor data
        const ai = rawData.ai;   // AI analysis results

        if (!data) {
          console.error('No sensor data available');
          return;
        }

        const processedData = {
          turbineId: data.turbineId,
          timestamp: data.timestamp,
          windSpeed: data.windSpeed,
          rotorSpeed: data.rotorSpeed,
          temperature: data.temperature,
          vibration: data.vibration,
          power: data.power,
          result: ai?.result || 'NORMAL',
          reason: ai?.reason || ''
        };

        console.log('Processed data:', processedData);

        setMessages(prev => {
          const newMessages = [...prev, processedData].slice(-MAX_DATA_POINTS);
          return newMessages;
        });

        setLatestMessage(processedData);

        if (processedData.result === 'FAULT') {
          setFaults(prev => [{
            time: formatTimestamp(processedData.timestamp),
            reason: processedData.reason
          }, ...prev]);
        }
      } catch (error) {
        console.error('Data parsing error:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const formatValue = (value, unit) => {
    if (value === undefined || value === null) return '--';
    return `${Number(value).toFixed(2)} ${unit}`;
  };

  const getStatusColor = (status) => {
    return status === 'NORMAL' ? '#4CAF50' : '#FF5252';
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Connection Error';
      default:
        return 'Unknown Status';
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return '#4CAF50';
      case 'connecting':
        return '#FFC107';
      case 'disconnected':
      case 'error':
        return '#FF5252';
      default:
        return '#666';
    }
  };

  return (
    <div className="App">
      <div className="connection-status" style={{ color: getConnectionStatusColor() }}>
        {getConnectionStatusText()}
      </div>
      <h1>Wind Turbine Dashboard</h1>

      <div className="dashboard-grid">
        {/* Current Status Panel */}
        <div className="status-panel">
          <h2>Current Status</h2>
          {latestMessage ? (
            <div className="status-grid">
              <div>
                <div className="status-label">Turbine ID</div>
                <div className="status-value">{latestMessage.turbineId || '--'}</div>
              </div>
              <div>
                <div className="status-label">Wind Speed</div>
                <div className="status-value">{formatValue(latestMessage.windSpeed, 'm/s')}</div>
              </div>
              <div>
                <div className="status-label">Rotor Speed</div>
                <div className="status-value">{formatValue(latestMessage.rotorSpeed, 'rpm')}</div>
              </div>
              <div>
                <div className="status-label">Temperature</div>
                <div className="status-value">{formatValue(latestMessage.temperature, '°C')}</div>
              </div>
              <div>
                <div className="status-label">Vibration</div>
                <div className="status-value">{formatValue(latestMessage.vibration, 'mm/s')}</div>
              </div>
              <div>
                <div className="status-label">Power</div>
                <div className="status-value">{formatValue(latestMessage.power, 'kW')}</div>
              </div>
              <div>
                <div className="status-label">Status</div>
                <div className="status-value" style={{ color: getStatusColor(latestMessage.result) }}>
                  {latestMessage.result || '--'}
                </div>
              </div>
            </div>
          ) : (
            <div className="no-data">Waiting for data...</div>
          )}
        </div>

        {/* Line Chart */}
        <div className="chart-panel">
          <h2>Real-time Monitoring</h2>
          {messages.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={messages} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTimestamp}
                  stroke="#666"
                />
                <YAxis yAxisId="left" stroke="#666" />
                <YAxis yAxisId="right" orientation="right" stroke="#666" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    border: 'none',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                  labelFormatter={formatTimestamp}
                  formatter={(value, name) => {
                    const units = {
                      'Wind Speed': 'm/s',
                      'Temperature': '°C',
                      'Vibration': 'mm/s',
                      'Rotor Speed': 'rpm',
                      'Power': 'kW'
                    };
                    return [`${Number(value).toFixed(2)} ${units[name] || ''}`, name];
                  }}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="windSpeed"
                  stroke="#8884d8"
                  name="Wind Speed"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="temperature"
                  stroke="#82ca9d"
                  name="Temperature"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="vibration"
                  stroke="#ffc658"
                  name="Vibration"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="rotorSpeed"
                  stroke="#ff7300"
                  name="Rotor Speed"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="power"
                  stroke="#00C49F"
                  name="Power"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">Waiting for data...</div>
          )}
        </div>

        {/* Fault List */}
        <div className="fault-panel">
          <h2>Fault History</h2>
          <div className="fault-list">
            {faults.length === 0 ? (
              <div className="no-faults">No fault records</div>
            ) : (
              faults.map((fault, index) => (
                <div key={index} className="fault-item">
                  <div className="fault-time">{fault.time}</div>
                  <div className="fault-reason">{fault.reason}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
