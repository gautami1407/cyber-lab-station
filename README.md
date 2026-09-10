# CyberLab Suite

Build a complete, polished, responsive cybersecurity learning and assessment toolkit called CyberLab Security Toolkit.

The application is an educational cybersecurity project demonstrating five security concepts:

Cybersecurity Authentication Toolkit

Network Security Port Scanner

Network Security IP Range Scanner

Application Security

Subdomain Enumeration

IMPORTANT:

This is an educational cybersecurity application.

The UI must clearly state that network scanning and enumeration must only be used against systems/domains the user owns or has explicit permission to test.

Build the frontend first.

Do NOT implement real scanning, enumeration, network requests, password hashing, authentication logic, or security-sensitive backend functionality in the frontend.

Use mock/demo data where necessary.

All actual security operations will later be implemented by a separate backend.

Structure the frontend so it can easily connect to REST APIs later.

TECHNOLOGY

Use:

React

TypeScript

Tailwind CSS

Modern component architecture

Responsive design

Accessible UI components

Clean state management

React Router or an equivalent routing solution

Lucide icons or another clean icon library

Use a professional cybersecurity/SOC-inspired visual design.

Do NOT make it look like a generic dashboard template.

VISUAL DESIGN

Theme:

Dark cybersecurity interface

Background: near-black / dark navy

Primary accent: electric cyan

Secondary accent: blue/purple

Success: green

Warning: amber

Danger: red

Cards with subtle borders

Subtle glow effects

Good spacing and typography

Avoid excessive neon effects

Keep the application professional and suitable for a university cybersecurity project demonstration.

The interface should feel similar to a modern Security Operations Center dashboard.

Use:

Rounded cards

Subtle shadows

Status badges

Progress indicators

Data tables

Terminal-style result panels where appropriate

Empty states

Loading states

Error states

Confirmation dialogs for potentially sensitive actions

APPLICATION STRUCTURE

Create the following pages:

1. Dashboard

Route:

/dashboard

Create a main dashboard showing:

Welcome message

"CyberLab Security Toolkit"

Short description explaining that this application demonstrates fundamental cybersecurity concepts.

Show five project cards:

Authentication Toolkit

Port Scanner

IP Range Scanner

Application Security

Subdomain Enumeration

Each card should contain:

Project number

Project title

Short description

Security concept

Status

"Open Project" button

Relevant icon

Also display:

Security Controls summary

Recent Activity

Project completion/progress

Authorized-use warning

Example warning:

"Authorized Use Only — Network scanning and enumeration features must only be used against systems and domains you own or have explicit permission to assess."

2. Authentication Toolkit

Route:

/projects/authentication

Create a polished authentication demonstration interface.

Include tabs or sections:

Register

Login

Password Strength

Session Management

Security Controls

Register UI

Fields:

Username

Email

Password

Confirm Password

Show:

Password requirements

Password strength meter

Validation messages

Password visibility toggle

Password match indicator

Requirements displayed:

Minimum length

Uppercase character

Lowercase character

Number

Special character

Do not display or store actual passwords in application logs.

Login UI

Fields:

Email/Username

Password

Remember me

Include:

Password visibility toggle

Login button

Loading state

Error state

Success state

Password Strength

Create a visual strength meter:

Very Weak

Weak

Medium

Strong

Very Strong

Show individual password requirements with checkmarks.

Session Management

Create a session-management visualization showing:

Session status

Session ID (masked)

Login time

Last activity

Expiration

Device

IP address (masked in UI)

Buttons:

Refresh Session

Logout

Logout All Sessions

Use mock data for now.

Security Controls

Display cards for:

Password hashing

Session expiration

Secure cookies

Login rate limiting

Account lockout

Input validation

CSRF protection

Generic authentication errors

Each should have:

Status

Short explanation

3. Port Scanner

Route:

/projects/port-scanner

Create a port scanner interface, but frontend-only.

Include:

Target Configuration

Fields:

Target hostname/IP

Start port

End port

Scan profile

Profiles:

Common Ports

Web Ports

Custom Range

Include an authorization confirmation:

"I confirm that I own this system or have explicit permission to test it."

The scan button must remain disabled until the authorization checkbox is selected.

Add a visible notice:

"Only scan systems you own or are explicitly authorized to test."

Scan Controls

Buttons:

Start Scan

Stop Scan

Clear Results

Show loading/progress state.

Results

Create a professional table:

| Port | Protocol | Status | Service | Response Time |

Example mock results:

22 | TCP | Open | SSH | 18ms
80 | TCP | Open | HTTP | 21ms
443 | TCP | Open | HTTPS | 19ms
3306 | TCP | Closed | MySQL | -

Use badges:

Open = green
Closed = gray
Filtered = amber
Error = red

Include:

Total ports scanned

Open ports

Closed ports

Errors

Scan duration

Add search/filter controls.

4. IP Range Scanner

Route:

/projects/ip-range-scanner

Create an IP range discovery interface.

Inputs:

Start IP

End IP

Optional CIDR notation

Discovery method

Show examples:

192.168.1.1 - 192.168.1.254

or

192.168.1.0/24

Require authorization confirmation before enabling the scan.

Show an informational warning that scanning must only occur in an authorized environment.

Results table:

| IP Address | Status | Hostname | Response Time | Method |

Statuses:

Active

Inactive

Unknown

Error

Summary cards:

Addresses checked

Active hosts

Inactive hosts

Errors

Include:

Start Scan

Stop Scan

Clear Results

Export Results

Use mock data until the backend is connected.

5. Application Security

Route:

/projects/application-security

Create an interactive application-security demonstration.

Sections:

Input Validation

Allow the user to enter sample input.

Show validation checks:

Required field

Length validation

Email validation

Numeric validation

Allowed characters

Sanitization status

Show safe/unsafe result states.

Authentication

Show authentication controls:

Strong password requirements

Secure password storage

Session timeout

Login rate limiting

MFA readiness

Authorization

Create a role selector:

Guest

User

Moderator

Administrator

Show an access-control matrix.

Example:

Dashboard:
Guest: No
User: Yes
Moderator: Yes
Administrator: Yes

Admin Settings:
Guest: No
User: No
Moderator: No
Administrator: Yes

Security Checks

Create cards for:

Input validation

Authentication

Authorization

Password handling

Session security

Error handling

Security headers

Rate limiting

Each has:

PASS / WARNING / FAIL

Security Recommendations

Create a recommendation panel with prioritized recommendations:

Critical
High
Medium
Low

6. Subdomain Enumeration

Route:

/projects/subdomain-enumeration

Create a domain enumeration interface.

Input:

Domain

Example:

example.com

Require authorization confirmation before starting.

Enumeration methods displayed:

DNS lookup

Certificate Transparency

Passive sources

Wordlist-based discovery

IMPORTANT:
These are UI representations only. Do not implement real enumeration in the frontend.

Results table:

| Subdomain | Status | IP Address | Source |

Example:

www.example.com | Active | 93.184.x.x | DNS
mail.example.com | Active | 93.184.x.x | DNS
dev.example.com | Found | — | Certificate Transparency

Summary:

Subdomains found

Active

Inactive

Sources

Include:

Start Enumeration

Stop

Clear

Export

7. Activity / History

Route:

/activity

Show previous security operations.

Columns:

Time

Project

Operation

Target

Status

Duration

Mask sensitive information where appropriate.

Use mock activity data.

8. Documentation

Route:

/documentation

Create detailed documentation for all five projects.

Sections:

Overview

Authentication Toolkit

Port Scanner

IP Range Scanner

Application Security

Subdomain Enumeration

Security Principles

Authorized Use

Architecture

API Integration

Error Handling

Security Recommendations

For each project explain:

Objective

How it works

Inputs

Processing

Output

Security considerations

Limitations

Clearly state:

"This toolkit is intended for educational and authorized security testing only."

9. Settings

Route:

/settings

Include:

Theme

API connection status

Backend URL

Notification preferences

Session settings

Security preferences

Do not expose secrets or API keys in the frontend.

GLOBAL NAVIGATION

Create a left sidebar containing:

Dashboard

Authentication

Port Scanner

IP Range Scanner

Application Security

Subdomain Enumeration

Activity

Documentation

Settings

At the bottom:

System Status

Backend Connection

User/Profile menu

On mobile, convert the sidebar into a responsive drawer.

GLOBAL COMPONENTS

Create reusable components:

Sidebar

Header

ProjectCard

SecurityBadge

StatusBadge

AlertBanner

AuthorizationCheckbox

PasswordStrengthMeter

DataTable

EmptyState

LoadingState

ErrorState

ConfirmationDialog

ProgressBar

StatCard

TerminalOutput

SecurityCheckCard

DocumentationSection

API-READY ARCHITECTURE

Although the frontend should initially use mock data, create a clean API abstraction.

Create services such as:

authService
scannerService
ipScannerService
subdomainService
securityService

Example future endpoints:

POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/session

POST /api/scanner/ports
POST /api/scanner/ip-range

POST /api/subdomains/enumerate

POST /api/security/validate

GET /api/activity

Do not implement these backend endpoints now.

Use TypeScript interfaces for API request/response types so the backend can be connected later without redesigning the UI.

ERROR HANDLING

Every operation needs:

Idle state

Loading state

Success state

Error state

Empty state

Show useful user-friendly errors.

Never display:

Stack traces

Internal server errors

Secrets

Passwords

Authentication tokens

RESPONSIVENESS

The application must work on:

Desktop

Laptop

Tablet

Mobile

The dashboard should adapt intelligently to smaller screens.

Tables should become horizontally scrollable or responsive cards.

ACCESSIBILITY

Include:

Keyboard navigation

Visible focus states

Accessible labels

Good color contrast

ARIA labels where needed

Do not rely only on colors for status

SECURITY UX

Every potentially sensitive operation should include an authorization confirmation.

For scanning/enumeration projects:

"Authorized Use Confirmation"

Checkbox:

"I confirm that I have ownership or explicit authorization to test this target."

Do not allow scanning actions from the UI until this is checked.

DEMO MODE

Add a "Demo Mode" indicator.

The frontend should initially operate using mock data.

Create realistic simulated results and progress animations so the complete UI can be demonstrated before the backend exists.

Do not fake real security findings as real-world findings. Clearly label simulated data as DEMO DATA.

CODE QUALITY

Organize code cleanly by feature.

Suggested structure:

src/
components/
layouts/
pages/
features/
authentication/
port-scanner/
ip-scanner/
application-security/
subdomain-enumeration/
services/
types/
hooks/
utils/
data/

Use reusable components instead of duplicating UI.

FINAL REQUIREMENT

Build the entire frontend as a cohesive application, not five unrelated pages.

The result should look like a professional university cybersecurity capstone/project demonstration.

Prioritize:

Excellent UI/UX

Clear security concepts

Responsive design

Accessibility

API-ready architecture

Clear documentation

Authorized-use controls

Realistic demo states

Do not implement real network scanning or subdomain enumeration in the frontend.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://cyber-lab-station.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/37ebaf71-7428-46d3-b318-8efb879d4fda).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
