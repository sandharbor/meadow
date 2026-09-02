/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { coreConceptIds as id } from "../ids.js";
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from "../language.js";

export const meadowHome = define({
  id: id.meadowHome, name: "Meadow Home", kind: "artifact", aliases: ["Home"],
  definition: text`The file-backed durable store that survives ${link(id.officialClient, "Official Clients")} and ${link(id.runtimeInstance, "Runtime Instances")}.`,
  mechanics: [text`Exactly one ${link(id.runtimeInstance, "Runtime Instance")} may mutate it at a time.`, text`Its runtime metadata includes a ${link(id.homeOwnershipLock, "Home Ownership Lock")} and ${link(id.runtimeSessionDescriptor, "Runtime Session Descriptor")}.`],
  interplay: text`${link(id.officialClient, "Official Clients")} never edit it directly; they ask its owning ${link(id.runtimeInstance, "Runtime Instance")} to perform operations.`,
});

export const runtimeInstance = define({
  id: id.runtimeInstance, name: "Runtime Instance", aliases: ["Runtime"], kind: "entity",
  definition: text`The one live backend assembly allowed to mutate a particular ${link(id.meadowHome, "Meadow Home")}.`,
  mechanics: [text`It contains the ${link(id.runtimeSupervisor, "Runtime Supervisor")}, ${link(id.runtimeService, "Runtime service")}, and served ${link(id.webClient, "Web Client")} assets for one ${link(id.runtimePayload, "Runtime Payload")}.`, text`It starts on demand and can shut down after every ${link(id.lease, "Lease")} is gone and the idle timeout passes.`],
  interplay: text`The Supervisor establishes it, the ${link(id.homeOwnershipLock, "Home Ownership Lock")} proves its ownership, and the ${link(id.runtimeSessionDescriptor, "Runtime Session Descriptor")} lets clients find it.`,
  implementationRoles: ["coordinate"] as const,
});

export const runtimeSupervisor = define({
  id: id.runtimeSupervisor, name: "Runtime Supervisor", aliases: ["Supervisor"], kind: "service",
  definition: text`The process that alone may create and coordinate ${link(id.runtimeService, "Runtime service")} processes.`,
  mechanics: [text`An invoking client starts it with a client-written ${link(id.runtimeLaunchSpec, "Runtime Launch Spec")}.`, text`It acquires or recovers the ${link(id.homeOwnershipLock, "Home Ownership Lock")} before creating a writer.`, text`It publishes the ${link(id.runtimeSessionDescriptor, "Runtime Session Descriptor")}, manages ${link(id.lease, "Leases")}, and performs orderly shutdown or handoff.`],
  interplay: text`Clients may invoke a packaged Supervisor when discovery finds no usable Runtime, but they never start the Runtime service themselves.`,
  implementationRoles: ["create-runtime-service", "coordinate-lifecycle"] as const,
});

export const runtimeLaunchSpec = define({
  id: id.runtimeLaunchSpec, name: "Runtime Launch Spec", aliases: ["Runtime Supervisor Launch Spec", "launch spec JSON", "launch spec"], kind: "artifact",
  definition: text`A one-use JSON startup handoff written by an ${link(id.officialClient, "Official Client")} for a new ${link(id.runtimeSupervisor, "Runtime Supervisor")} process.`,
  mechanics: [text`The client writes a unique private file immediately before invoking its packaged Supervisor.`, text`It names the ${link(id.meadowHome, "Meadow Home")} and ${link(id.runtimePayload, "Runtime Payload")} and provides the service and Web commands, working directories, environments, and idle timeout.`, text`The new Supervisor validates and reads the file named by --launch-spec, then deletes it before startup continues.`],
  interplay: text`It supplies startup instructions; it grants no Home ownership and does not advertise a ready Runtime like the ${link(id.runtimeSessionDescriptor, "Runtime Session Descriptor")}.`,
  implementationRoles: ["write", "read-once"] as const,
});

export const runtimeService = define({
  id: id.runtimeService, name: "Runtime Service", kind: "service",
  definition: text`The backend process that performs domain operations and is the sole writer of the ${link(id.meadowHome, "Meadow Home")}.`,
  mechanics: [text`It is created only by the ${link(id.runtimeSupervisor, "Runtime Supervisor")}.`, text`${link(id.officialClient, "Official Clients")} reach it through the Runtime's control and application interfaces.`],
  interplay: text`The Supervisor controls its lifecycle; the ${link(id.homeOwnershipLock, "Home Ownership Lock")} prevents a second Runtime service from writing the same Home.`,
  implementationRoles: ["start-service", "mutate-home"] as const,
});

export const runtimePayload = define({
  id: id.runtimePayload, name: "Runtime Payload", aliases: ["Payload"], kind: "artifact",
  definition: text`A build-produced, versioned set of Supervisor, service, ${link(id.webClient, "Web Client")}, native support, and contributed modules.`,
  mechanics: [text`Its identity participates in ${link(id.compatibilityNegotiation, "Compatibility Negotiation")}.`, text`Desktop and Command distributions from the same build carry byte-identifiable copies.`],
  interplay: text`A client with an incompatible payload must wait for a safe ${link(id.cooperativeHandoff, "Cooperative Handoff")} instead of starting a second writer.`,
  implementationRoles: ["build-launch-spec"] as const,
});

export const homeOwnershipLock = define({
  id: id.homeOwnershipLock, name: "Home Ownership Lock", aliases: ["ownership lock"], kind: "artifact",
  definition: text`The artifact that proves which ${link(id.runtimeInstance, "Runtime Instance")} has exclusive mutation ownership of a ${link(id.meadowHome, "Meadow Home")}.`,
  mechanics: [text`The ${link(id.runtimeSupervisor, "Runtime Supervisor")} acquires it before starting the ${link(id.runtimeService, "Runtime Service")}.`, text`It is released only after service and Web processes stop.`, text`A stale lock can be recovered only after its recorded owner is no longer alive.`],
  interplay: text`The ${link(id.runtimeSessionDescriptor, "Runtime Session Descriptor")} advertises how to connect and ${link(id.lease, "Leases")} control lifetime; neither substitutes for the ownership lock.`,
  implementationRoles: ["acquire", "recover-stale-owner", "release"] as const,
});

export const runtimeSessionDescriptor = define({
  id: id.runtimeSessionDescriptor, name: "Runtime Session Descriptor", aliases: ["Session Descriptor", "descriptor"], kind: "artifact",
  definition: text`The discovery artifact that advertises a Runtime's connection and compatibility information.`,
  mechanics: [text`It records the owning instance, protocol, ${link(id.runtimePayload, "Runtime Payload")} identity, readiness, and local endpoints.`, text`Clients validate it before attaching or asking a Supervisor to start anything.`, text`It is removed before final shutdown completes.`],
  interplay: text`The descriptor helps clients find the owner; the ${link(id.homeOwnershipLock, "Home Ownership Lock")} separately proves authority to mutate the Home.`,
  implementationRoles: ["publish", "discover", "remove-stale"] as const,
});

export const officialClient = define({
  id: id.officialClient, name: "Official Client", aliases: ["client"], kind: "role",
  definition: text`A supported interface that discovers, negotiates with, and attaches to a Runtime instead of editing the Home directly.`,
  mechanics: [text`A connected client holds a ${link(id.clientLease, "Client Lease")}.`, text`${link(id.desktopHost, "Desktop Host")}, ${link(id.commandClient, "Command Client")}, and ${link(id.webClient, "Web Client")} provide different surfaces over the same Runtime.`, text`If discovery finds no usable Runtime, a native client writes a ${link(id.runtimeLaunchSpec, "Runtime Launch Spec")} and invokes its packaged Supervisor.`],
  interplay: text`Clients use the ${link(id.runtimeSessionDescriptor, "Session Descriptor")} for discovery, ${link(id.compatibilityNegotiation, "Compatibility Negotiation")} for attachment, and Leases for liveness.`,
  implementationRoles: ["discover-and-attach"] as const,
});

export const desktopHost = define({
  id: id.desktopHost, name: "Desktop Host", aliases: ["Desktop"], kind: "role",
  definition: text`The native application shell that provides operating-system integration and hosts Meadow's client surfaces.`,
  mechanics: [text`It embeds the ${link(id.webClient, "Web Client")} and ${link(id.commandClient, "Command Client")}.`, text`It carries the same ${link(id.runtimePayload, "Runtime Payload")} identity as the matching Command distribution.`],
  interplay: text`It is a client and host, not the owner or creator of the ${link(id.runtimeService, "Runtime Service")}.`,
});

export const commandClient = define({
  id: id.commandClient, name: "Command Client", aliases: ["Command"], kind: "interface",
  definition: text`The public, stable, machine-readable interface used by agents and command-line workflows.`,
  mechanics: [text`It performs explicit operations through the Runtime's public command/query boundary.`, text`It discovers and attaches to an existing compatible Runtime whenever possible.`],
  interplay: text`It may invoke the packaged ${link(id.runtimeSupervisor, "Runtime Supervisor")}, but never becomes the Runtime or writes the Home itself.`,
});

export const webClient = define({
  id: id.webClient, name: "Web Client", kind: "interface",
  definition: text`The complete visual Meadow application, used in a browser session or embedded inside the ${link(id.desktopHost, "Desktop Host")}.`,
  mechanics: [text`Its static assets are served by the ${link(id.runtimeInstance, "Runtime Instance")}.`, text`A browser launch uses a one-time token that becomes a bounded ${link(id.browserSession, "Browser Session")} whose open pages send a ${link(id.heartbeat, "Heartbeat")}.`],
  interplay: text`A Browser Session can keep the Runtime alive while the Desktop Host supplies native integration around the same Web Client.`,
});

export const lease = define({
  id: id.lease, name: "Lease", kind: "mechanism",
  definition: text`A temporary liveness claim that keeps the Runtime running; it never grants ownership of the ${link(id.meadowHome, "Meadow Home")}.`,
  mechanics: [text`${link(id.clientLease, "Client Leases")} represent connected clients or valid browser sessions.`, text`${link(id.operationLease, "Operation Leases")} represent active work that must finish before shutdown.`, text`When no Lease remains, the idle timeout permits orderly shutdown.`],
  interplay: text`Leases affect Runtime lifetime, while the ${link(id.homeOwnershipLock, "Home Ownership Lock")} independently controls exclusive mutation authority.`,
  implementationRoles: ["track-liveness"] as const,
});

export const clientLease = define({
  id: id.clientLease, name: "Client Lease", kind: "mechanism",
  definition: text`A ${link(id.lease, "Lease")} held on behalf of a connected ${link(id.officialClient, "Official Client")}.`,
  mechanics: [text`It is acquired after a client attaches to a compatible Runtime.`, text`A normal exit releases it; a crashed client's lease remains until the Supervisor reaps it.`],
  interplay: text`It keeps the Runtime alive without granting direct access to mutate the Home.`,
});

export const operationLease = define({
  id: id.operationLease, name: "Operation Lease", kind: "mechanism",
  definition: text`A ${link(id.lease, "Lease")} representing active work whose completion must not be interrupted by idle shutdown.`,
  mechanics: [text`It is acquired when an operation begins and released when that operation finishes.`],
  interplay: text`Both Operation and ${link(id.clientLease, "Client Leases")} contribute to Runtime liveness; neither provides Home ownership.`,
});

export const browserSession = define({
  id: id.browserSession, name: "Browser Session", kind: "entity",
  definition: text`A bounded ${link(id.webClient, "Web Client")} session created by exchanging a one-time launch token.`,
  mechanics: [text`The session is represented by an HttpOnly, SameSite=Strict cookie and a ${link(id.heartbeat, "Heartbeat")} from each open page.`, text`A clean page close shortens its liveness claim; a lost browser expires after its last Heartbeat.`],
  interplay: text`It acts as a client-liveness claim without becoming a general Runtime capability.`,
  implementationRoles: ["exchange-and-track"] as const,
});

export const heartbeat = define({
  id: id.heartbeat, name: "Heartbeat", aliases: ["browser heartbeat"], kind: "mechanism",
  definition: text`A periodic liveness signal sent by each open browser page to keep its ${link(id.browserSession, "Browser Session")} active.`,
  mechanics: [text`The ${link(id.webClient, "Web Client")} sends one immediately and then at a fixed interval, identifying the page that remains open.`, text`The ${link(id.runtimeSupervisor, "Runtime Supervisor")} renews that page's bounded lifetime only when the Heartbeat arrives; ordinary application requests do not renew it.`, text`If the Heartbeat stops, the page's liveness claim expires after a bounded TTL; a clean close signal shortens that wait.`],
  interplay: text`It renews the Browser Session's ${link(id.lease, "Lease")}-like liveness claim; its absence eventually lets the Runtime become idle and shut down safely.`,
  implementationRoles: ["emit-page-liveness", "renew-page-liveness"] as const,
});

export const compatibilityNegotiation = define({
  id: id.compatibilityNegotiation, name: "Compatibility Negotiation", aliases: ["compatibility"], kind: "process",
  definition: text`The decision that determines whether a client can attach to the current ${link(id.runtimePayload, "Runtime Payload")}.`,
  mechanics: [text`Protocol, application version, and payload identity are compared.`, text`The result is attach, refuse while busy, or ${link(id.cooperativeHandoff, "Cooperative Handoff")} when safe.`],
  interplay: text`It protects one-Runtime-per-Home while allowing compatible clients to converge on the existing owner.`,
  implementationRoles: ["decide"] as const,
});

export const cooperativeHandoff = define({
  id: id.cooperativeHandoff, name: "Cooperative Handoff", aliases: ["handoff"], kind: "process",
  definition: text`An orderly transfer from an idle incompatible ${link(id.runtimePayload, "Runtime Payload")} to a requested replacement.`,
  mechanics: [text`The current owner removes its ${link(id.runtimeSessionDescriptor, "Runtime Session Descriptor")}, stops its children, and releases the ${link(id.homeOwnershipLock, "Home Ownership Lock")}.`, text`Only after ownership is released may the prospective ${link(id.runtimeSupervisor, "Runtime Supervisor")} acquire the lock and start the replacement.`],
  interplay: text`It avoids force-killing an owner and prevents two backend copies from writing the same ${link(id.meadowHome, "Meadow Home")}.`,
  implementationRoles: ["request", "compatibility-decision", "owner-shutdown", "ownership-transfer"] as const,
});

export const runtimeOwnershipConcepts = [
  meadowHome, runtimeInstance, runtimeSupervisor, runtimeLaunchSpec, runtimeService,
  runtimePayload, homeOwnershipLock, runtimeSessionDescriptor, officialClient,
  desktopHost, commandClient, webClient, lease, clientLease, operationLease,
  browserSession, heartbeat, compatibilityNegotiation, cooperativeHandoff,
] as const;

export type RuntimeOwnershipConcept = typeof runtimeOwnershipConcepts[number];
export type RuntimeOwnershipConceptId = RuntimeOwnershipConcept["id"];
