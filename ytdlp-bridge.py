#!/usr/bin/env python3
"""
Stream Sniper - yt-dlp Native Messaging Bridge
Handles communication between the browser extension and yt-dlp command-line tool
"""

import sys
import json
import struct
import subprocess
import os
import shutil
from pathlib import Path
import threading
import time

# Message format for native messaging
def get_message():
    """Read a message from stdin"""
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        sys.exit(0)
    message_length = struct.unpack('=I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

def send_message(message):
    """Send a message to stdout"""
    encoded_content = json.dumps(message).encode('utf-8')
    encoded_length = struct.pack('=I', len(encoded_content))
    sys.stdout.buffer.write(encoded_length)
    sys.stdout.buffer.write(encoded_content)
    sys.stdout.buffer.flush()

def find_ytdlp():
    """Find yt-dlp executable in system PATH"""
    # Try common names
    for name in ['yt-dlp', 'yt-dlp.exe', 'youtube-dl', 'youtube-dl.exe']:
        path = shutil.which(name)
        if path:
            return path
    return None

def check_availability():
    """Check if yt-dlp is available and working"""
    ytdlp_path = find_ytdlp()
    if not ytdlp_path:
        return {
            'available': False,
            'error': 'yt-dlp not found in system PATH'
        }

    try:
        # Test yt-dlp with --version
        result = subprocess.run(
            [ytdlp_path, '--version'],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0:
            return {
                'available': True,
                'version': result.stdout.strip(),
                'path': ytdlp_path
            }
        else:
            return {
                'available': False,
                'error': f'yt-dlp returned error code {result.returncode}'
            }
    except subprocess.TimeoutExpired:
        return {
            'available': False,
            'error': 'yt-dlp command timed out'
        }
    except Exception as e:
        return {
            'available': False,
            'error': str(e)
        }

def get_formats(url):
    """Get available formats for a URL"""
    ytdlp_path = find_ytdlp()
    if not ytdlp_path:
        return {'error': 'yt-dlp not found'}

    try:
        # Run yt-dlp with --list-formats and JSON output
        result = subprocess.run(
            [ytdlp_path, '--list-formats', '--dump-json', url],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            # Parse JSON output
            data = json.loads(result.stdout)
            formats = []

            if 'formats' in data:
                for fmt in data['formats']:
                    formats.append({
                        'id': fmt.get('format_id', ''),
                        'ext': fmt.get('ext', ''),
                        'resolution': fmt.get('resolution', 'unknown'),
                        'width': fmt.get('width'),
                        'height': fmt.get('height'),
                        'fps': fmt.get('fps'),
                        'vcodec': fmt.get('vcodec', 'none'),
                        'acodec': fmt.get('acodec', 'none'),
                        'filesize': fmt.get('filesize'),
                        'tbr': fmt.get('tbr'),
                        'format_note': fmt.get('format_note', '')
                    })

            return {
                'success': True,
                'formats': formats,
                'title': data.get('title', 'Unknown')
            }
        else:
            return {
                'error': f'yt-dlp error: {result.stderr}'
            }
    except subprocess.TimeoutExpired:
        return {'error': 'Request timed out'}
    except Exception as e:
        return {'error': str(e)}

def download_stream(url, output_path, format_id='best', extra_args=None):
    """Download a stream using yt-dlp"""
    ytdlp_path = find_ytdlp()
    if not ytdlp_path:
        send_message({
            'type': 'error',
            'error': 'yt-dlp not found'
        })
        return

    try:
        # Build command
        cmd = [
            ytdlp_path,
            '-f', format_id,
            '-o', output_path,
            '--newline',  # Force newline for progress
            '--no-playlist',  # Don't download playlists
            url
        ]

        # Add extra arguments if provided
        if extra_args:
            if isinstance(extra_args, str):
                cmd.extend(extra_args.split())
            elif isinstance(extra_args, list):
                cmd.extend(extra_args)

        # Send start message
        send_message({
            'type': 'started',
            'command': ' '.join(cmd)
        })

        # Start download process
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        # Monitor progress
        for line in process.stdout:
            line = line.strip()

            # Parse progress line
            if '[download]' in line:
                # Example: [download]  45.8% of 123.45MiB at 2.34MiB/s ETA 00:30
                if '%' in line:
                    try:
                        parts = line.split()
                        percent_idx = next(i for i, part in enumerate(parts) if '%' in part)
                        percent_str = parts[percent_idx].replace('%', '')
                        percent = float(percent_str)

                        # Extract size and speed
                        size = None
                        speed = None
                        eta = None

                        for i, part in enumerate(parts):
                            if 'of' in part and i + 1 < len(parts):
                                size = parts[i + 1]
                            elif 'at' in part and i + 1 < len(parts):
                                speed = parts[i + 1]
                            elif 'ETA' in part and i + 1 < len(parts):
                                eta = parts[i + 1]

                        send_message({
                            'type': 'progress',
                            'percent': percent,
                            'size': size,
                            'speed': speed,
                            'eta': eta
                        })
                    except (ValueError, StopIteration):
                        pass

            # Send status messages
            elif '[download]' in line and 'Destination:' in line:
                send_message({
                    'type': 'info',
                    'message': line
                })
            elif 'Merging formats' in line or 'ffmpeg' in line:
                send_message({
                    'type': 'info',
                    'message': 'Merging video and audio tracks...'
                })

        # Wait for completion
        return_code = process.wait()

        if return_code == 0:
            send_message({
                'type': 'completed',
                'output': output_path
            })
        else:
            send_message({
                'type': 'error',
                'error': f'Download failed with code {return_code}'
            })

    except Exception as e:
        send_message({
            'type': 'error',
            'error': str(e)
        })

def update_manifest(extension_id):
    """Update native messaging manifest with extension ID"""
    try:
        # Determine manifest path based on OS
        if os.name == 'nt':  # Windows
            appdata = os.getenv('APPDATA')
            manifest_path = os.path.join(appdata, 'StreamSniper', 'com.streamsniper.ytdlp.json')
        else:  # macOS/Linux
            home = str(Path.home())
            if sys.platform == 'darwin':  # macOS
                manifest_path = os.path.join(home, 'Library', 'Application Support', 'StreamSniper', 'com.streamsniper.ytdlp.json')
            else:  # Linux
                manifest_path = os.path.join(home, '.local', 'share', 'StreamSniper', 'com.streamsniper.ytdlp.json')

        # Check if manifest exists
        if not os.path.exists(manifest_path):
            return {
                'type': 'error',
                'error': f'Manifest file not found at {manifest_path}'
            }

        # Read current manifest
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)

        # Update extension ID
        manifest['allowed_extensions'] = [extension_id]

        # Create backup
        backup_path = manifest_path + '.backup'
        with open(backup_path, 'w') as f:
            json.dump(manifest, f, indent=2)

        # Write updated manifest
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)

        return {
            'type': 'manifestUpdated',
            'path': manifest_path,
            'extensionId': extension_id
        }

    except Exception as e:
        return {
            'type': 'error',
            'error': f'Failed to update manifest: {str(e)}'
        }

def handle_message(message):
    """Handle incoming message from extension"""
    msg_type = message.get('type', '')

    if msg_type == 'check':
        # Check if yt-dlp is available
        result = check_availability()
        send_message(result)

    elif msg_type == 'getFormats':
        # Get available formats for URL
        url = message.get('url', '')
        if url:
            result = get_formats(url)
            send_message(result)
        else:
            send_message({'error': 'No URL provided'})

    elif msg_type == 'download':
        # Start download
        url = message.get('url', '')
        output = message.get('output', '')
        format_id = message.get('format', 'best')
        extra_args = message.get('args', None)

        if url and output:
            # Run download in background thread
            download_thread = threading.Thread(
                target=download_stream,
                args=(url, output, format_id, extra_args)
            )
            download_thread.start()
        else:
            send_message({
                'type': 'error',
                'error': 'Missing URL or output path'
            })

    elif msg_type == 'updateManifest':
        # Update native messaging manifest with extension ID
        extension_id = message.get('extensionId', '')
        if extension_id:
            result = update_manifest(extension_id)
            send_message(result)
        else:
            send_message({
                'type': 'error',
                'error': 'No extension ID provided'
            })

    else:
        send_message({
            'error': f'Unknown message type: {msg_type}'
        })

def main():
    """Main loop - read messages from stdin"""
    try:
        while True:
            message = get_message()
            handle_message(message)
    except Exception as e:
        send_message({
            'type': 'error',
            'error': f'Bridge error: {str(e)}'
        })
        sys.exit(1)

if __name__ == '__main__':
    main()
