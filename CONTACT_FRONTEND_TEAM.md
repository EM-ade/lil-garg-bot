# Message to Send to Frontend Team

**Subject: Urgent: HTTPS Required for Verification Flow**

Hi team,

Our NFT verification flow is currently broken due to a **mixed content error**. The frontend at `https://lilgarg.xyz` is trying to make HTTP calls to our backend server, but browsers block HTTP requests from HTTPS pages for security reasons.

## The Issue
- **Frontend**: `https://lilgarg.xyz` (HTTPS)
- **Backend**: `http://2.56.246.119:30391` (HTTP only)
- **Result**: Browsers block the API calls

## The Solution
I've configured HTTPS on our backend server. Please update the frontend API URL:

### Current (Broken)
```javascript
const API_BASE = 'http://2.56.246.119:30391';
```

### New (Working)
```javascript
const API_BASE = 'https://2.56.246.119:8443';
```

Alternatively, if you prefer to keep port 30391:
```javascript
const API_BASE = 'https://2.56.246.119:30391';
```

## Impact
- **Immediate fix** for verification flow
- **No other changes** required
- **Security improvement** with HTTPS

## Testing
After the change:
1. Clear browser cache
2. Test verification flow
3. Check Network tab - should show HTTPS requests

**Time to fix**: 2-minute code change + deployment

## Technical Details
- Backend now supports HTTPS on port 8443
- Self-signed certificate installed
- CORS configured for `https://lilgarg.xyz`
- HTTP kept for backward compatibility

Please let me know when this is deployed! Users are currently unable to verify their NFTs.

Thanks!