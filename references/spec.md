# Diagram spec (YAML)

```yaml
title: My architecture          # optional, used as the draw.io page name
theme: light                    # light (web/docs) | dark (slides)
profile: default                # default | training (T&C: white bg, 16pt black text, 2pt lines)
direction: right                # right | down   (flow direction)
callouts: large                 # large (simple diagrams) | small (complex) - never mixed
engine: aws                     # aws (structure-first, default) | elk (ELK layered)

groups:                         # structure first
  - id: cloud                   # unique id (groups and nodes share one namespace)
    type: aws-cloud             # see table below
  - id: vpc
    type: vpc
    parent: region              # id of the enclosing group (omit = top level)
    label: Virtual private cloud (VPC)   # optional, defaults to the preset label
    cidr: 10.0.0.0/16           # optional, printed at the right of the group header
    layout: flow                # optional: flow (default) | row | column
    row: 0                      # optional lane inside the parent (0 = first). Lanes stack across the flow
  - id: orders
    type: custom                # custom group for a service: category color + its 32px icon
    service: step-functions
    label: Order processing

nodes:
  - id: alb
    icon: alb                   # catalog id or alias or official name (find-icon.mjs)
    label: Application Load Balancer   # optional, defaults to the official name. "\n" forces a break
    parent: pub1
    step: 3                     # optional numbered callout next to the icon
    row: 1                      # optional lane inside the parent group (see Layout below)

edges:
  - from: users                 # node or group id
    to: alb
    label: HTTPS                # optional, 12pt, keep it short
    step: 1                     # optional numbered callout on the arrow
    arrow: end                  # end (default) | both | none | start

steps:                          # optional numbered legend under the diagram
  1: Users connect over HTTPS.
  2: ...
```

## Group types

| `type` | Use for | Parent should be |
|---|---|---|
| `aws-cloud` / `aws-cloud-alt` | the AWS Cloud boundary (`-alt` = no AWS logo, e.g. China Regions) | top level or `aws-account` |
| `aws-account` | an AWS account | top level / `aws-cloud` |
| `region` | a Region (label e.g. "Region (us-east-1)") | `aws-cloud` / `aws-account` |
| `vpc` | a VPC | `region` (or `aws-cloud`) |
| `availability-zone` | an AZ (label "Availability Zone 1") | `vpc` / `region` |
| `public-subnet`, `private-subnet` | subnets (**errors if outside a VPC/AZ**) | `availability-zone` / `vpc` |
| `security-group` | a security group | subnet / VPC |
| `auto-scaling-group` | an Auto Scaling group | subnet / VPC / AZ |
| `ec2-instance-contents`, `spot-fleet` | what runs inside an instance / a Spot Fleet | subnet, SG, ASG |
| `corporate-data-center`, `server-contents` | on-premises | top level |
| `iot-greengrass`, `iot-greengrass-deployment`, `elastic-beanstalk-container`, `step-functions-workflow` | service groups from the deck | anywhere |
| `generic`, `generic-dashed` | anything else (gray, solid/dashed, give it a `label`) | anywhere |
| `custom` + `service:` | a service-scoped group (deck slide 26) | anywhere |

## Validation

- **Errors** (rendering is blocked): unknown icon (with suggestions), unknown group type, duplicate ids, unknown parent or a node used as parent,
  parent cycles, subnets outside VPC/AZ, non-integer callout numbers, labels needing more than 2 lines, labels that break a word with a hyphen,
  edges to unknown ids, self-loops, unknown enum values.
- **Warnings**: unusual nesting, AWS services outside the AWS Cloud group, empty groups, group labels that differ from the preset wording,
  callout numbering gaps or duplicates, many large callouts, labels wider than 2 × 140 px.

Run `node scripts/validate.mjs spec.yaml --strict` to treat warnings as errors.

## Layout

- Children of a group are placed in **columns along the flow**, ordered by the arrows. Parallel groups (AZs, Regions, accounts) share one column.
- `row: N` on groups or nodes splits a parent into **lanes** that are stacked across the flow (below each other when `direction: right`).
  Every lane is laid out on its own. Use lanes to mirror a two-tier picture, e.g. *primary site + monitoring* on lane 0 and *DR Region* on lane 1,
  or a main chain in lane 0 with its consumers in lane 1.
- `layout: row|column` places children in spec order without ranking.
- A top-level icon (e.g. users) is aligned with the icon it connects to.
- Edge labels are placed at the first free spot along the arrow, avoiding icons, labels and group titles.
