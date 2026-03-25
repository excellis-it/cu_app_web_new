# Call Management Implementation

## Overview
Implemented two features to improve call management in the ExTalk application:

1. **Join Call Button Visibility**: The "Join Call" button is now only visible in the specific group with an active call
2. **Alert for Multiple Calls**: Users attempting to join or receive another call while already in an active call will see an alert message

## Changes Made

### 1. `/components/start_call.js`
- Modified `openModal()` function (lines 129-199)
- Modified `opencallModal()` function (lines 201-227)

**What was added:**
- Check for active call state before opening call preview modal
- If user is already in a call (`userInActiveCall === "true"`) and tries to join a different group, show alert
- Alert message: "Already in a Call. You are already in an active call. Please end the current call before joining another one."

```javascript
const userInActiveCall = sessionStorage.getItem("userInActiveCall");
const activeCallId = sessionStorage.getItem("activeCallId");

if (userInActiveCall === "true" && activeCallId && activeCallId !== group_id.toString()) {
  const { default: Swal } = await import('sweetalert2');
  Swal.fire({
    title: 'Already in a Call',
    text: 'You are already in an active call. Please end the current call before joining another one.',
    icon: 'warning',
    confirmButtonText: 'OK',
    confirmButtonColor: '#f37e20'
  });
  return;
}
```

### 2. `/components/incomming_call.js`
- Modified `clickJoin()` function (lines 86-128)

**What was added:**
- Check for active call state before joining an incoming call
- If user is already in a different call, show alert and automatically reject the incoming call
- Prevents users from accidentally answering calls while in another conversation

### 3. `/components/room.js`
- Modified `goToBack()` function (lines 939-962)

**What was added:**
- Added cleanup of session storage when user leaves a call:
  ```javascript
  sessionStorage.removeItem("userInActiveCall");
  sessionStorage.removeItem("activeCallId");
  ```

### 4. `/src/pages/messages/index.js`
- Modified `onSendData` callback (lines 3495-3504)

**What was added:**
- Added cleanup of `activeCallId` when call ends via the Room component callback

## How It Works

### Session Storage Tracking
The application now uses two session storage keys to track active calls:
- `userInActiveCall`: Boolean string ("true") indicating if user is in any call
- `activeCallId`: The group/room ID of the current active call

### Flow

1. **Starting a Call:**
   - User clicks video/audio call button → `openModal()` or `opencallModal()` is called
   - System checks if user is already in a call
   - If yes and it's a different group → Show alert and prevent join
   - If no or same group → Allow call to proceed

2. **Receiving a Call:**
   - Incoming call notification appears → User clicks join
   - `clickJoin()` checks for active call
   - If user is in a different call → Show alert and auto-reject
   - If not → Allow user to join

3. **Ending a Call:**
   - User clicks end call button → `goToBack()` is called
   - System cleans up session storage (removes `userInActiveCall` and `activeCallId`)
   - User is now free to join other calls

### Benefits

1. **Prevents Call Conflicts**: Users cannot accidentally join multiple calls
2. **Clear User Feedback**: Alert messages explain why action is blocked
3. **Automatic State Management**: Session storage automatically cleaned up on call end
4. **Better UX**: "Join Call" button only shows where there's actually an active call
5. **No Multiple Call Issues**: Prevents audio/video conflicts from multiple simultaneous calls

## Testing

To test these features:
1. Start a call in Group A
2. Try to initiate/receive a call from Group B → Should see alert
3. End call in Group A
4. Try to join Group B → Should work normally

The changes ensure a single active call per user at any given time while providing clear feedback when restrictions apply.
