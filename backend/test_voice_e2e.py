import asyncio
import websockets
import json
import requests

# 1. Create session
r = requests.post('http://127.0.0.1:8000/api/v1/voice/sessions', json={'role': 'CITIZEN'})
data = r.json()
token = data['session_token']
print('Session created:', data['session_id'])

async def run_voice_test():
    ws_url = f'ws://127.0.0.1:8000/ws/voice/{token}'
    async with websockets.connect(ws_url) as ws:
        # Loop over incoming messages
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=20)
            ev = json.loads(raw)
            t = ev.get('type', '')
            role = ev.get('role', '')
            text = ev.get('text', '')
            print(f'EVENT: {t} role={role} | {text[:100]}')

            if t == 'session.ready':
                print('>>> Sending user_text: "There is a fire at 123 Main Street!"')
                await ws.send(json.dumps({'type': 'user_text', 'text': 'There is a fire at 123 Main Street!'}))

            if t == 'transcript' and role == 'AGENT' and ('fire' in text.lower() or 'dispatch' in text.lower() or 'street' in text.lower() or 'main' in text.lower() or 'calm' in text.lower()):
                print('>>> SUCCESS: Agent responded to user emergency description!')
                print(f'Agent reply: "{text}"')
                break

asyncio.run(run_voice_test())
