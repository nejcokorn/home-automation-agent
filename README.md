# Home Automation Agent
NestJS service that manages CAN devices and exposes an HTTP API.  
Built to run as a systemd service on Ubuntu, with configuration via `/etc/home-automation-agent/config`.

## Install / Upgrade
Download the .deb from GitHub Releases, then install/upgrade the service.
```bash
curl -fL -o home-automation-agent_1.1.0_arm64.deb \
  https://github.com/nejcokorn/home-automation-agent/releases/download/v1.1.0/home-automation-agent_1.1.0_arm64.deb

# Install home-automation-agent_1.1.0_arm64.deb
sudo dpkg -i home-automation-agent_1.1.0_arm64.deb
sudo systemctl daemon-reload
sudo systemctl enable --now home-automation-agent
```

## Build
Required system packages
```bash
sudo apt-get update
sudo apt-get install -y debhelper-compat devscripts build-essential
```

Build the .deb (downloads Node automatically)
```bash
NODE_VERSION=22.22.0 ./scripts/package.sh
```

Optional: specify architecture explicitly
```bash
NODE_VERSION=22.22.0 NODE_ARCH=arm64 ./scripts/package.sh
```

Cleanup after build artifacts
```bash
dpkg-buildpackage -Tclean
```

## GitHub Release
Recommended: upload the built `.deb` as a Release asset instead of committing it to the repo.

Quick manual flow
```bash
# 1) Build the package
./scripts/package.sh

# 2) Create a tag (optional but recommended)
git tag v1.1.0
git push origin v1.1.0
```

Then in GitHub:
- Create a new Release (based on the tag).
- Upload `home-automation-agent_1.1.0_arm64.deb`.
- Optionally upload `home-automation-agent-dbgsym_1.1.0_arm64.deb`.



## API Documentation

This document describes the HTTP API exposed by `home-automation-agent` (NestJS).

### Basics

- **Base URL**: `http://<host>:3200`
- **Content-Type**: `application/json`
- **Authentication**: not implemented

#### Standard response
Most endpoints return an object with `success` and `data` fields.

```json
{
  "success": true,
  "data": {}
}
```

#### Errors
The global exception filter returns:

```json
{
  "success": false,
  "error": {
    "message": "...",
    "type": "HttpException | TimeoutError | Error | Unknown"
  }
}
```

Note: `POST /can/:iface/device/:deviceId/config` currently **returns a raw `Error` object** on failure, not the standardized format.

### CAN

#### `GET /can`
Returns the list of CAN interfaces opened by the process.

**Response**
```json
{
  "name": "can0",
  "rxCount": 123,
  "txCount": 45
}
```

#### `POST /can/:iface/tx`
Sends a raw CAN frame to the given interface.

**Params**
- `iface` – CAN interface name (e.g. `can0`)

**Body**
```json
{
  "id": 123,
  "data": [0, 1, 2, 3, 4, 5, 6, 7],
  "ext": true,
  "rtr": false
}
```

**Notes**
- `data` is passed directly to `socketcan` (no validation). Prefer `data` as a byte array (0–255).

**Response**
```json
{ "success": true }
```

---

### Devices
All endpoints below are under `/can/:iface/device/...`.

#### `GET /can/:iface/device`
Discovers devices on the CAN bus.

**Response**
```json
{ "success": true, "data": [1, 2, 3] }
```

#### `GET /can/:iface/device/:deviceId/ping`
Pings a single device or broadcasts (depending on `deviceId`).

**Response**
```json
{ "success": true, "data": [1] }
```

#### `GET /can/:iface/device/:deviceId/config`
Reads device configuration.

**Response**
```json
{
  "success": true,
  "data": [
    {
      "inputPortIdx": 0,
      "debounce": 0,
      "doubleclick": 0,
      "actions": [],
      "bypassInstantly": 0,
      "bypassOnDIPSwitch": 0,
      "bypassOnDisconnect": 0
    }
  ]
}
```

#### `POST /can/:iface/device/:deviceId/config`
Sets device configuration. Body is a **list** of `DeviceConfigDto`.

**Body**
```json
[
  {
    "inputPortIdx": 0,
    "debounce": 1000,
    "doubleclick": 300,
    "actions": [
      {
        "trigger": "rising",
        "mode": "click",
        "type": "toggle",
        "longpress": 0,
        "output": {
          "deviceId": 2,
          "ports": [1, 2],
          "skipWhenDelayDeviceId": null,
          "skipWhenDelayPorts": [],
          "clearDelayDeviceId": null,
          "clearDelayPorts": [],
          "delay": 0
        }
      }
    ],
    "bypassInstantly": 0,
    "bypassOnDIPSwitch": 0,
    "bypassOnDisconnect": 0
  }
]
```

**Response**
Returns the current device configuration after applying changes.

---

#### `POST /can/:iface/device/:deviceId/eeprom`
Writes configuration to EEPROM.

**Response**
```json
{
  "success": true,
  "data": { "EEPROMSize": 6404 }
}
```

#### `GET /can/:iface/device/:deviceId/delay`
Returns the list of delays on the device.

**Response**
```json
{
  "success": true,
  "data": [
    { "id": 10, "deviceId": 2, "execute": true, "delay": 500, "port": 3, "type": "high" }
  ]
}
```

#### `DELETE /can/:iface/device/:deviceId/delay/:delayId`
Deletes a delay by ID.

**Response**
```json
{ "success": true, "data": { "deletedDelayIds": [10] } }
```

#### `DELETE /can/:iface/device/:deviceId/delay/port/:port`
Deletes delays for a given port.

**Response**
```json
{ "success": true, "data": { "deletedDelayIds": [4, 7, 55] } }
```

---

#### `GET /can/:iface/device/:deviceId/:signalType/:direction/:portId`
Reads the current port state.

**Params**
- `signalType`: `analog` | `digital`
- `direction`: `input` | `output`

**Response**
```json
{ "success": true, "data": { "currentState": 0 } }
```

#### `POST /can/:iface/device/:deviceId/:signalType/:direction/:portId`
Sets the port state.

**Body**
```json
{
  "type": "high",
  "delay": 0,
  "extra": 0
}
```

**Response**
```json
{ "success": true, "data": { "currentState": 1 } }
```

---

### Types and constraints

#### `ActionTrigger`
- `disabled`
- `rising`
- `falling`

#### `ActionMode`
- `click`
- `longpress`
- `doubleclick`

#### `ActionType`
- `low`
- `high`
- `toggle`
- `pwm`

#### `DeviceConfigDto`
- `inputPortIdx`: int 0–15
- `debounce`: int 0–16777215 (µs)
- `doubleclick`: int 0–16777215 (ms)
- `actions`: array max 256, elements of type `ActionDto`
- `bypassInstantly`: 0 | 1
- `bypassOnDIPSwitch`: 0 | 1
- `bypassOnDisconnect`: int 0–16777215 (ms)

#### `ActionDto`
- `trigger`: `ActionTrigger` (default: `disabled`)
- `mode`: `ActionMode` (default: `click`)
- `type`: `ActionType`
- `longpress`: int (ms, default 0)
- `output`: `ActionDtoOutput`

#### `ActionDtoOutput`
- `deviceId`: int 0–255
- `ports`: int[] (0–11), max 12
- `skipWhenDelayDeviceId`: int 0–255 | null
- `skipWhenDelayPorts`: int[] (0–11), max 12
- `clearDelayDeviceId`: int 0–255 | null
- `clearDelayPorts`: int[] (0–11), max 12
- `delay`: int (ms, default 0)

#### `DeviceCommandDto`
- `type`: `ActionType`
- `delay`: int 0–4294967295 (optional, default 0)
- `extra`: int 0–4294967295 (optional)

---

### Notes on timeouts
Some CAN commands have strict timeouts (e.g. `ping`, `config`, `listDelays`). On timeout the API returns `TimeoutError`.
