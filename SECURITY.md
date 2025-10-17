# security policy

## reporting a vulnerability

we take security seriously. if you discover a security vulnerability, please follow these steps:

### 1. do not create a public issue

security vulnerabilities should not be publicly disclosed until they have been addressed.

### 2. report privately

send an email to: **fentbuscoding@gmail.com**

include:

- description of the vulnerability
- steps to reproduce
- potential impact
- suggested fix (if any)

### 3. response time

- we will acknowledge your email within 48 hours
- we will provide an estimated timeline for a fix
- we will notify you when the vulnerability is fixed

## security best practices

### for users

- always use the latest version
- verify urls before pasting (youtube/instagram)
- don't paste untrusted urls
- use reputable browsers (chrome, firefox, safari, edge)
- keep your browser updated

### for developers

- all file processing happens client-side
- no files are uploaded to servers
- youtube/instagram downloads use server proxy only
- no user data is stored or logged
- no tracking or analytics
- https recommended for deployment

## known security features

### client-side processing

- files never leave your device
- no server uploads means no data breaches
- processing happens in your browser

### no data collection

- no cookies (except theme preference)
- no analytics or tracking
- no personal information collected
- no ip address logging

### youtube/instagram proxy

- urls are not logged
- no download history stored
- temporary files deleted immediately
- no user identification

## scope

### in scope

- xss vulnerabilities
- injection attacks
- authentication/authorization issues
- data exposure
- cryptographic issues

### out of scope

- dos/ddos attacks
- social engineering
- physical attacks
- third-party vulnerabilities (ffmpeg.wasm, yt-dlp)

## security updates

security fixes will be released as:

- **critical** - immediate patch release
- **high** - patch within 7 days
- **medium** - patch within 30 days
- **low** - patch in next regular release

## dependencies

we regularly update dependencies to patch known vulnerabilities:

- ffmpeg.wasm - video processing library
- yt-dlp - youtube download backend
- instaloader - instagram download backend

## responsible disclosure

we request that security researchers:

- give us reasonable time to fix issues
- don't access or modify user data
- don't perform dos attacks
- don't exploit for personal gain

## hall of fame

we recognize security researchers who help keep our project secure:

<!-- contributors will be listed here -->

---

thank you for helping keep media converter secure! 🔒
