---
name: aws-architecture-draw
description: Draw AWS architecture diagrams that follow the official AWS Architecture Icons guidelines (release 2026.07.31) with the official icon set, and export editable draw.io plus SVG/PNG. Use when the user asks to draw, diagram, visualize or sketch an AWS architecture, convert a description, Terraform/CloudFormation or a whiteboard photo into an AWS diagram, or review/fix an AWS diagram against the AWS guidelines (groups, icons, arrows, labels, numbered callouts).
---

# AWS architecture diagrams (official icons + guidelines)

You never draw shapes by hand. Instead, you write a small **YAML spec** and the scripts take care of the rest:
they pick the official SVG icons, apply the group colors and line styles, lay everything out and route the arrows.
All of this follows the AWS deck. Your job is to get the **architecture** right and express it in the spec.

Everything lives in this skill's folder (`<skill>` below). Run `npm install` there once (Node ≥ 18).

## Workflow

1. **Understand the architecture.** List the actors, the services, the network boundaries (account → Region → VPC → AZ → subnet)
   and the main request/data flow. If something essential is ambiguous (e.g. single- vs multi-AZ), ask the user once.
   For anything else, pick the conventional AWS answer.
2. **Find the icons.** Common aliases work directly (`s3`, `alb`, `lambda`, `rds`, `nat`, `igw`, `users`, ...).
   If you are unsure, search: `node <skill>/scripts/find-icon.mjs <keyword> [--kind service|resource|general]`.
   - *Service* icon = the service itself (Amazon EC2, Amazon S3).
   - *Resource* icon = a thing of that service (EC2 Instance, S3 Bucket, NAT gateway, Lambda function). In network diagrams,
     prefer resource icons inside subnets (e.g. `ec2-instance`, `nat-gateway`).
   - *General* icons cover users, clients, servers, internet, documents and similar things.
3. **Write the spec.** Use `<name>.yaml` next to where the user wants the output. See [references/spec.md](references/spec.md).
   Start with the structure (groups) first, then add the icons, then the arrows. This is the order the deck prescribes.
4. **Render.** Run `node <skill>/scripts/render.mjs <name>.yaml [--out <dir>]`.
   The script validates the spec first. **Errors block rendering, so fix them.** Read every warning and either fix it or
   keep it on purpose. The script writes `<name>.drawio`, `<name>.svg` and `<name>.png`.
5. **Look at the PNG** (open it with your image-reading tool) and check it against the checklist below.
   If something is off, adjust the spec (order, `layout:`, labels, `direction:`) and render again.
6. **Deliver** the `.drawio` (editable in draw.io / diagrams.net / VS Code draw.io extension) and the PNG/SVG.
   Mention any short service names you used. The guideline requires the full name to appear somewhere in the document.

## Guideline essentials (full notes: [references/guidelines.md](references/guidelines.md))

- **Groups** carry the structure. They have no fill, a 1.25 pt border, and their icon and label sit top-left.
  - AWS Cloud ⊃ Region ⊃ VPC ⊃ Availability Zone ⊃ public/private subnet ⊃ security group / Auto Scaling group.
  - An Auto Scaling group may span AZs. Use a `generic` group when no preset fits, or `custom` with `service:` for a service group.
  - Never invent group icons.
- **Icons** are always 48 px. Do not resize, crop, rotate, flip or recolor them. Always use SVG, never PNG.
- **Arrows**: 1.25 pt with an "Open Arrow" head, straight lines and right angles only. Only the presets are allowed:
  `arrow: end | both | none`. There are **no dashed arrows** in the presets, so express secondary flows (monitoring, backup, failover)
  with an edge `label:` instead of a line style.
- **Labels**: 12 pt Arial, at most **2 lines**, never broken mid-word. "AWS"/"Amazon" stays with the service name.
  Short forms such as "Amazon EC2" are allowed only if the full name appears elsewhere in the document,
  and two services must never share a short form.
- **Numbered callouts**: digits only, one size per diagram (`callouts: large|small`), numbered linearly
  (left→right / top→bottom / clockwise). Light theme uses black circles with white digits; dark theme is the reverse.
  Add `steps:` to print a numbered legend.
- **Theme**: `light` for web/docs, `dark` for slides. `profile: training` gives Training & Certification output
  (white background, 16 pt black text, 2 pt lines).

## Review checklist (after looking at the PNG)

- [ ] Every AWS service sits inside the AWS Cloud group (unless it is intentionally on-prem or third-party).
- [ ] Nesting is correct: subnets inside VPC (and AZ), AZs side by side, nothing floats outside its boundary.
- [ ] The flow reads in one direction, and callouts run 1..n in reading order.
- [ ] No label exceeds 2 lines or is cut mid-word. Service names are official (check `find-icon` output).
- [ ] Arrows do not cross icons or labels. If they do, try reordering nodes/groups in the spec,
      `layout: row|column` on a group, or `direction: down`.
- [ ] No arrows were added that the architecture does not have, and no essential flow is missing.

## Layout tips

- Children of a group are placed in **columns along the flow** (`direction: right` → left-to-right), ordered by the arrows.
  Parallel groups (AZs, Regions, accounts) share a column, so AZ 1 and AZ 2 sit side by side with matching subnets.
- Within a column, the order in the spec decides the order on the page. List AZ 1 before AZ 2, and public before private.
- Use `row: N` on children to split a group into lanes stacked across the flow (e.g. primary site on lane 0, DR Region on lane 1).
  This is the main tool for keeping wide diagrams compact.
- Use `layout: row` or `layout: column` on a group to force a simple sequence in spec order.
- Unconnected icons (e.g. a NAT gateway) are placed next to their neighbors in spec order.
- `engine: elk` switches to the ELK layered engine, which can be better for large flow-heavy diagrams with few groups.

## Files

- `scripts/render.mjs` (validate + layout + export), `scripts/validate.mjs` (checks only), `scripts/find-icon.mjs`.
- `catalog/icons.json` is the generated icon index; `catalog/aliases.json` holds the curated aliases;
  `catalog/guidelines.json` holds the machine-readable guideline values.
- `icons/` contains the official AWS Architecture Icons asset package (SVG only). The release is in `icons/RELEASE`.
  To update it, extract the new package and run `node scripts/import-icons.mjs <dir>` and then `npm run catalog`.
- `examples/*.yaml` are reference specs (3-tier multi-AZ, serverless dark, the deck's Chef example); `examples/out/` holds their renders.
