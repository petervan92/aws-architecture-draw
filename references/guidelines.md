# AWS Architecture Icons: diagram guidelines (release 2026.07.31)

This file condenses the official deck `AWS-Architecture-Icons-Deck_For-Light-BG_07312026.pptx`
(dark version: `..._For-Dark-BG_07312026.pptx`). Slide numbers refer to the **light** deck.
Measurements were read from the deck's shapes and converted at 96 DPI. The machine-readable copy that the
renderer uses is [`catalog/guidelines.json`](../catalog/guidelines.json). If you change a value, change it in both files.

## 1. System elements (slides 8–9)

| Element | Purpose |
|---|---|
| **Groups** | Show the connections between services/resources (AWS Cloud, Region, VPC, subnets, ...) |
| **Arrows** | Describe a flow of information or connect parts of the diagram |
| **Service icons** | Represent an AWS service (`Architecture-Service-Icons`, 48 px) |
| **Resource icons** | Represent a resource of a service (`Resource-Icons`, 48 px), e.g. *Instance*, *NAT gateway* |
| **General resource icons** | Apply to resources/objects across services (User, Client, Server, Internet, ...) |

Canonical nesting from slide 9: `AWS Cloud ⊃ VPC ⊃ Availability Zone 1/2 ⊃ (NAT gateway, Auto Scaling group ⊃ Instances)`.
An Auto Scaling group may **cross** AZs. VPC and subnets **nest**.

## 2. Building a diagram (slide 11)

1. **Choose the deck style.** Light backgrounds are for the web; dark backgrounds are for in-person presentations and slides.
2. **Start with the structure.** Lay out the groups first.
3. **Add service or resource icons.** Take them from the asset package and do not redraw them.
4. **Connect the steps** with the preset arrows.
5. **Add final touches.** Numbered callouts can convey order.

Portrait use case (slide 12): for Word documents and blogs the page is 6.5" × 8.75" on a white background, with the same guidelines.
Training & Certification (slide 13): white background only, all type 16 pt black, lines 2 pt, icon sizes and colors unchanged.
→ The renderer supports this with `profile: training`.

## 3. Groups (slides 14, 25, 26)

- Each group = **icon + label**. Colors and line styles distinguish them.
- Nested groups: the inner group must keep **≥ 0.05" (≈ 5 px) buffer on all sides** (we use ≥ 20 px).
- DO use a *generic group* when no preset fits, or a *custom group* (slide 26).
- DON'T create groups with non-approved icons. DON'T resize group icons (40 × 40 px).
- Border: 1.25 pt, **no fill**. Label: 12 pt Arial, theme text color. Label inset is 0.55" (53 px) left when the group has a top-left icon, and 0.1" (10 px) top.

| Type (spec `type:`) | Label | Stroke | Line | Icon |
|---|---|---|---|---|
| `aws-cloud` | AWS Cloud | text color (#000 / #FFF) | solid | AWS-Cloud-logo (top-left) |
| `aws-cloud-alt` | AWS Cloud | text color | solid | AWS-Cloud (no logo; e.g. China Regions) |
| `region` | Region | `#00A4A6` | **sysDash** (fine dots) | Region (top-left) |
| `availability-zone` | Availability Zone | `#00A4A6` | **dash** | none, label centered |
| `security-group` | Security group | `#DD344C` | solid | none, label left |
| `auto-scaling-group` | Auto Scaling group | `#ED7100` | **dash** | icon **top-center**, label centered |
| `vpc` | Virtual private cloud (VPC) | `#8C4FFF` | solid | VPC |
| `private-subnet` | Private subnet | `#00A4A6` | solid | Private subnet |
| `public-subnet` | Public subnet | `#7AA116` | solid | Public subnet |
| `server-contents` | Server contents | `#7D8998` | solid | Server contents |
| `corporate-data-center` | Corporate data center | `#7D8998` | solid | Corporate data center |
| `ec2-instance-contents` | EC2 instance contents | `#ED7100` | solid | EC2 instance contents |
| `spot-fleet` | Spot Fleet | `#ED7100` | solid | Spot Fleet |
| `aws-account` | AWS account | `#E7157B` | solid | AWS account |
| `iot-greengrass-deployment` | AWS IoT Greengrass Deployment | `#7AA116` | solid | Greengrass deployment |
| `iot-greengrass` | AWS IoT Greengrass | `#7AA116` | solid | service icon 32 |
| `elastic-beanstalk-container` | Elastic Beanstalk container | `#ED7100` | solid | service icon 32 |
| `step-functions-workflow` | AWS Step Functions workflow | `#E7157B` | solid | service icon 32 |
| `generic` / `generic-dashed` | (yours) | `#7D8998` | solid / dash | none, label centered |
| `custom` + `service:` | (yours) | category color of the service | solid | the service's **32 px SVG** icon |

The deck shows subnets with **no fill** in this release. Older releases used a tinted fill, so do not add one.
In the slide 21 example, the CIDR (e.g. `10.0.0.0/16`) is a separate 12 pt label at the right of the group header (spec `cidr:`).

### Category colors (from `Category-Icons`, used for custom groups)

| Color | Categories |
|---|---|
| `#8C4FFF` | Analytics, Networking & Content Delivery, Games, Serverless |
| `#ED7100` | Compute, Containers, Blockchain, Media Services, Quantum Technologies |
| `#7AA116` | Storage, Internet of Things, Cloud Financial Management |
| `#C925D1` | Databases, Developer Tools, Customer Enablement, Satellite |
| `#E7157B` | Application Integration, Management Tools, Multicloud & Hybrid |
| `#DD344C` | Security, Identity & Compliance, Business Applications, Customer Experience, Front-End Web & Mobile |
| `#01A88D` | Artificial Intelligence, End User Computing, Migration & Modernization |

## 4. Icons (slide 15)

- Icons work on both light and dark backgrounds. The general icons have `_Light` / `_Dark` variants, so pick the one that matches the theme.
- **In diagrams, use icons at their predefined size (48 px) and do not resize them.** Scaling is only allowed in presentations, and then proportionally (Shift).
- DON'T crop, flip, rotate or change the shape of icons. DON'T recolor them.
- Use SVG and never PNG (slide 26: "image quality will be degraded").

## 5. Arrows (slides 16, 27)

- Use the **preset arrows**: line 1.25 pt, **"Open Arrow"** head (size: medium width, small length), theme line color (light: black; the dark deck examples use `#9BA7B6`).
- Use **straight lines and right angles** wherever possible. A diagonal is acceptable only where right angles are impossible.
- Presets: one-way, two-way, and plain line (no head). They come as straight, elbow or curved-corner. DON'T use any other arrow style.

## 6. Icon labels (slide 17)

- **12 pt Arial throughout the diagram**, centered under the icon.
- An AWS service name fits on **no more than two lines**. **Never break mid-word.**
- "AWS"/"Amazon" always stays with the service name, on the same line as its first word.
  If you need to break, break **after the second word** (`AWS Elastic` / `Beanstalk`).
- Short forms (`Amazon EC2` instead of `Amazon Elastic Compute Cloud`) are allowed to save space,
  **but only if the full name is mentioned somewhere in the document**. Never reuse one short form for two services
  (e.g. "ELB" for both Elastic Beanstalk and Elastic Load Balancing).
- Labels of general icons may be customized for the use case (e.g. "User" → "Profile").

## 7. Numbered callouts (slide 18)

- Use them to draw attention to the steps of a process. Check with your team whether callouts are allowed.
- **Large** (0.36", 35 px, 14 pt bold Arial) for simple diagrams and **small** (0.3", 29 px, 11 pt bold) for complex ones.
- Light theme: black circle with white bold digits. Dark theme: white circle with black bold digits.
- DO keep the predefined size, color and format. Order numbers **linearly** (left→right, top→bottom, or clockwise) and place them consistently.
- DON'T mix sizes in one diagram, change color or font size, use letters or other symbols, stretch the shape, or create new callout shapes.

## 8. Examples (slides 20–21)

- *Git to S3 Webhooks*: Git users → third-party Git repository → (webhook) → AWS Cloud { Lambda, S3 SSH-key bucket, KMS key, S3 output bucket }.
- *Chef Automate on AWS*: AWS Cloud ⊃ AZ ⊃ VPC (10.0.0.0/16) ⊃ Public subnet (10.0.0.0/19) { Chef Automate }, Internet gateway on the VPC edge, workstation and node outside, plus callouts 1–3 with a numbered legend text box.

`examples/` contains specs that reproduce these patterns.
