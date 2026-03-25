import React, { useState, useEffect } from 'react';

const MinuteStepDateTimePicker = ({
  value,
  onChange,
  label = "Meeting Time",
  error,
  disabled = false
}) => {
  // Get the current date and time
  const now = new Date();

  // Helper to get the next minute from the current time (no rounding)
  function getNextMinute(date) {
    const minute = date.getMinutes();
    let next = minute + 1; // Next minute
    let hour = date.getHours();
    let ampm = convertTo12Hour(hour).ampm;
    // If next minute goes to 60, roll over to the next hour
    if (next === 60) {
      next = 0;
      hour = (hour + 1) % 24;
      ampm = convertTo12Hour(hour).ampm;
    }
    return { minute: next, hour, ampm };
  }

  // Calculate default values for minute, hour, and ampm
  const { minute: defaultMinute, hour: defaultHour, ampm: defaultAmPm } = getNextMinute(now);

  // Initialize state: use value if provided, otherwise use today's date and next future time
  const [date, setDate] = useState(value ? new Date(value) : now);
  const [hour, setHour] = useState(value ? convertTo12Hour(new Date(value).getHours()).hour12 : convertTo12Hour(defaultHour).hour12);
  const [minute, setMinute] = useState(value ? new Date(value).getMinutes() : defaultMinute);
  const [ampm, setAmPm] = useState(value ? convertTo12Hour(new Date(value).getHours()).ampm : defaultAmPm);

  useEffect(() => {
    if (value) {
      const dt = new Date(value);
      const { hour12, ampm } = convertTo12Hour(dt.getHours());
      setDate(dt);
      setHour(hour12);
      setMinute(dt.getMinutes()); // Use actual minute value, no rounding
      setAmPm(ampm);
    } else {
      setDate(now); // set to today if value is falsy
      const { minute, hour, ampm } = getNextMinute(now);
      setHour(convertTo12Hour(hour).hour12);
      setMinute(minute);
      setAmPm(ampm);
    }
  }, [value]);

  const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  // Generate all minutes from 00 to 59
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);

  const displayValue = date && !isNaN(date.getTime())
    ? `${date.toLocaleDateString()} at ${hour.toString().padStart(2, "0")}:${minute
      .toString()
      .padStart(2, "0")} ${ampm}`
    : "";

  const handleDateChange = (e) => {
    if (!e.target.value) {
      setDate(null);
      triggerChange(null, hour, minute, ampm);
      return;
    }
    const newDate = new Date(e.target.value);
    setDate(newDate);
    triggerChange(newDate, hour, minute, ampm);
  };

  const handleHourChange = (e) => {
    const newHour = parseInt(e.target.value, 10);
    setHour(newHour);
    triggerChange(date, newHour, minute, ampm);
  };

  const handleMinuteChange = (e) => {
    const newMinute = parseInt(e.target.value, 10);
    setMinute(newMinute);
    triggerChange(date, hour, newMinute, ampm);
  };

  const handleAmPmChange = (e) => {
    const newAmPm = e.target.value;
    setAmPm(newAmPm);
    triggerChange(date, hour, minute, newAmPm);
  };

  function triggerChange(dateObj, h, m, ampmVal) {
    if (
      dateObj &&
      !isNaN(dateObj.getTime()) && // <-- check for valid date
      !isNaN(h) &&
      !isNaN(m)
    ) {
      const newDate = new Date(dateObj);
      const finalHour = convertTo24Hour(h, ampmVal);
      newDate.setHours(finalHour, m, 0, 0);
      onChange && onChange(newDate.toISOString());
    } else {
      onChange && onChange(''); // Send empty string if invalid
    }
  }

  function convertTo12Hour(hour24) {
    const ampm = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    return { hour12, ampm };
  }

  function convertTo24Hour(hour12, ampmVal) {
    if (ampmVal === "AM") {
      return hour12 === 12 ? 0 : hour12;
    } else {
      return hour12 === 12 ? 12 : hour12 + 12;
    }
  }

  return (
    <div className="meeting_scheduler_input">
      <label style={{ fontWeight: "bold", display: "block", marginBottom: 8, fontSize: '14px', color: '#333' }}>{label}</label>
      <div style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: 'wrap',
        backgroundColor: '#ffffff',
        border: '1px solid #d0d0d0',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <input
          type="date"
          value={date && !isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : ""}
          onChange={handleDateChange}
          min={new Date().toISOString().slice(0, 10)}
          style={{
            padding: '8px 12px',
            backgroundColor: '#fff',
            color: '#000',
            border: '1px solid #ccc',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            outline: 'none',
            transition: 'border-color 0.2s',
            flex: '1',
            minWidth: '120px'
          }}
          disabled={disabled}
          aria-label="Date"
          onFocus={(e) => e.target.style.borderColor = '#f37e20'}
          onBlur={(e) => e.target.style.borderColor = '#ccc'}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            value={hour}
            onChange={handleHourChange}
            style={{
              padding: '8px 3px',
              minWidth: 50,
              backgroundColor: '#fff',
              color: '#000',
              border: '1px solid #ccc',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              outline: 'none',
              transition: 'border-color 0.2s',
              fontWeight: '500'
            }}
            disabled={disabled}
            aria-label="Hour"
            onFocus={(e) => e.target.style.borderColor = '#f37e20'}
            onBlur={(e) => e.target.style.borderColor = '#ccc'}
          >
            {hourOptions.map((h) => (
              <option key={h} value={h}>
                {h.toString().padStart(2, "0")}
              </option>
            ))}
          </select>
          <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#333', margin: '0 2px' }}>:</span>
          <select
            value={minute}
            onChange={handleMinuteChange}
            style={{
              padding: '8px 3px',
              minWidth: 50,
              backgroundColor: '#fff',
              color: '#000',
              border: '1px solid #ccc',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              outline: 'none',
              transition: 'border-color 0.2s',
              fontWeight: '500'
            }}
            disabled={disabled}
            aria-label="Minute"
            onFocus={(e) => e.target.style.borderColor = '#f37e20'}
            onBlur={(e) => e.target.style.borderColor = '#ccc'}
          >
            {minuteOptions.map((m) => (
              <option key={m} value={m}>
                {m.toString().padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
        <select
          value={ampm}
          onChange={handleAmPmChange}
          style={{
            padding: '8px 3px',
            minWidth: 50,
            backgroundColor: '#fff',
            color: '#000',
            border: '1px solid #ccc',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            outline: 'none',
            transition: 'border-color 0.2s',
            fontWeight: '500'
          }}
          disabled={disabled}
          aria-label="AM/PM"
          onFocus={(e) => e.target.style.borderColor = '#f37e20'}
          onBlur={(e) => e.target.style.borderColor = '#ccc'}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      <div style={{ marginTop: 8, color: "#666", fontSize: '13px', fontStyle: 'italic' }}>{displayValue}</div>
      {error && <div style={{ color: "#d32f2f", marginTop: 6, fontSize: '13px' }}>{error}</div>}
    </div>
  );
};

export default MinuteStepDateTimePicker;
