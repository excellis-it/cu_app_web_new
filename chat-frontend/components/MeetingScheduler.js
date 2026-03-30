import React, { useState, useEffect } from 'react';
import moment from 'moment';
import MinuteStepDateTimePicker from './MinuteStepDateTimePicker';

const MeetingScheduler = ({ onTimeChange, initialStartTime, initialDurationMin }) => {
  const [localStartTime, setLocalStartTime] = useState('');
  const [duration, setDuration] = useState(initialDurationMin || 15);
  const [minStartTime, setMinStartTime] = useState('');
  const [startTimeError, setStartTimeError] = useState('');
  const [durationError, setDurationError] = useState('');
  const [isStartTimeValid, setIsStartTimeValid] = useState(false);

  const getFormattedCurrentDateTime = () => {
    const now = new Date();
    return moment(now).format('YYYY-MM-DDTHH:mm');
  };

  const getDefaultStartTime = () => {
    const now = new Date();
    // Get next minute from current time (no rounding)
    const minutes = now.getMinutes();
    const nextMinute = minutes + 1;

    if (nextMinute === 60) {
      now.setHours(now.getHours() + 1);
      now.setMinutes(0);
    } else {
      now.setMinutes(nextMinute);
    }
    now.setSeconds(0);
    now.setMilliseconds(0);

    return now.toISOString();
  };

  useEffect(() => {
    const currentTime = getFormattedCurrentDateTime();
    setMinStartTime(currentTime);

    // Use initialStartTime if provided and valid, otherwise default
    const startToUse = initialStartTime && moment(initialStartTime).isValid()
      ? initialStartTime
      : getDefaultStartTime();

    setLocalStartTime(startToUse);
    setIsStartTimeValid(true);

    // Set duration from prop if available
    if (initialDurationMin) {
      setDuration(initialDurationMin);
    }

    // Calculate end time
    const startMoment = moment(startToUse);
    const usedDuration = initialDurationMin || duration;
    const utcStart = startMoment.utc().toISOString();
    const utcEnd = startMoment.clone().add(usedDuration, 'minutes').utc().toISOString();

    onTimeChange({ meetingStartTime: utcStart, meetingEndTime: utcEnd });
  }, [initialStartTime, initialDurationMin]);

  const handleStartTimeChange = (newValue) => {
    if (!newValue) {
      setStartTimeError('Please select a start time.');
      setLocalStartTime('');
      setIsStartTimeValid(false);
      onTimeChange({ meetingStartTime: '', meetingEndTime: '' });
      return;
    }

    const now = moment();
    const selectedStartTime = moment(newValue);

    if (!selectedStartTime.isValid() || selectedStartTime.isBefore(now)) {
      setStartTimeError('Start time must be greater than the current time.');
      setLocalStartTime('');
      setIsStartTimeValid(false);
      onTimeChange({ meetingStartTime: '', meetingEndTime: '' });
      return;
    }

    setStartTimeError('');
    setLocalStartTime(newValue);
    setIsStartTimeValid(true);

    // Always calculate end time with current duration
    const utcStart = selectedStartTime.utc().toISOString();
    const utcEnd = selectedStartTime.clone().add(Number(duration), 'minutes').utc().toISOString();
    onTimeChange({ meetingStartTime: utcStart, meetingEndTime: utcEnd });
  };

  const handleDurationChange = (e) => {
    const newDuration = e.target.value;
    setDuration(newDuration);

    if (!localStartTime) {
      setDurationError('Please select a start time first.');
      onTimeChange({ meetingStartTime: '', meetingEndTime: '' });
      return;
    }

    setDurationError('');
    const selectedStartTime = moment(localStartTime);

    if (!selectedStartTime.isValid()) {
      onTimeChange({ meetingStartTime: '', meetingEndTime: '' });
      return;
    }

    // Calculate end time and call onTimeChange
    const utcStart = selectedStartTime.utc().toISOString();
    const utcEnd = selectedStartTime.clone().add(Number(newDuration), 'minutes').utc().toISOString();
    onTimeChange({ meetingStartTime: utcStart, meetingEndTime: utcEnd });
  };

  // Duration options: 15 min to 120 min, step 5 min
  const durationOptions = [];
  for (let i = 15; i <= 120; i += 5) {
    durationOptions.push(i);
  }

  return (
    <>
      <div className='meeting_scheduler_wrapper'>
        <MinuteStepDateTimePicker
          value={localStartTime}
          onChange={handleStartTimeChange}
          label="Meeting Start Time"
          error={startTimeError}
        />
        <div className="meeting_scheduler_input">
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: 8, fontSize: '14px', color: '#333' }}>
            Meeting Duration
          </label>
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #d0d0d0',
            borderRadius: '8px',
            padding: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <select
              value={duration}
              onChange={handleDurationChange}
              style={{
                padding: '8px 12px',
                width: '100%',
                backgroundColor: '#fff',
                color: '#000',
                border: '1px solid #ccc',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer',
                outline: 'none',
                transition: 'border-color 0.2s',
                fontWeight: '500'
              }}
              onFocus={(e) => e.target.style.borderColor = '#1da678'}
              onBlur={(e) => e.target.style.borderColor = '#ccc'}
            >
              {durationOptions.map((min) => (
                <option key={min} value={min}>{min} min</option>
              ))}
            </select>
          </div>
          {durationError && <div style={{ color: '#d32f2f', marginTop: 6, fontSize: '13px' }}>{durationError}</div>}
        </div>
      </div>
    </>
  );
};

export default MeetingScheduler;