"""
domain/incidents/state_machine.py — Incident lifecycle state machine.

The backend is the exclusive authority on valid state transitions.
AI proposes → backend validates → state machine decides.

State graph:
  REPORTED → VERIFYING → TRIAGED → DISPATCHED → ON_SCENE → RESOLVED
                                              ↘                    ↗
                                            CANCELLED (from any active state)

Pre-conditions are validated BEFORE executing the transition.
"""
from __future__ import annotations

from app.core.exceptions import InvalidStateTransitionException, StatePreconditionException
from app.db.models.enums import IncidentStatus, IncidentType, IncidentSeverity


# Valid transitions: {from_status: [allowed_to_statuses]}
TRANSITION_MAP: dict[IncidentStatus, list[IncidentStatus]] = {
    IncidentStatus.REPORTED: [IncidentStatus.VERIFYING, IncidentStatus.CANCELLED],
    IncidentStatus.VERIFYING: [IncidentStatus.TRIAGED, IncidentStatus.CANCELLED],
    IncidentStatus.TRIAGED: [IncidentStatus.DISPATCHED, IncidentStatus.CANCELLED],
    IncidentStatus.DISPATCHED: [IncidentStatus.ON_SCENE, IncidentStatus.CANCELLED],
    IncidentStatus.ON_SCENE: [IncidentStatus.RESOLVED, IncidentStatus.CANCELLED],
    IncidentStatus.RESOLVED: [],
    IncidentStatus.CANCELLED: [],
}


class IncidentStateMachine:
    """Validates and executes incident state transitions.

    Does NOT persist state — that is the responsibility of IncidentService.
    Returns the validated new status; raises on invalid transition or
    unmet pre-conditions.
    """

    @staticmethod
    def validate_transition(
        current_status: IncidentStatus,
        target_status: IncidentStatus,
        incident_type: IncidentType | None = None,
        incident_severity: IncidentSeverity | None = None,
    ) -> IncidentStatus:
        """Validate a requested state transition and its pre-conditions.

        Args:
            current_status: The incident's current status.
            target_status: The requested new status.
            incident_type: Required non-null, non-OTHER for VERIFYING→TRIAGED.
            incident_severity: Required non-null for VERIFYING→TRIAGED.

        Returns:
            The validated target_status (pass-through for chaining).

        Raises:
            InvalidStateTransitionException: Transition not in the graph.
            StatePreconditionException: Pre-conditions for transition not met.
        """
        allowed = TRANSITION_MAP.get(current_status, [])
        if target_status not in allowed:
            raise InvalidStateTransitionException(
                current_status=current_status.value,
                attempted_status=target_status.value,
                allowed_targets=[s.value for s in allowed],
            )

        # Pre-condition: VERIFYING → TRIAGED requires type (non-null, non-OTHER) + severity
        if (
            current_status == IncidentStatus.VERIFYING
            and target_status == IncidentStatus.TRIAGED
        ):
            if incident_type is None or incident_type == IncidentType.OTHER:
                raise StatePreconditionException(
                    "Incident type must be set and not be OTHER before triaging.",
                    {"required": "type_not_null_not_other", "current": str(incident_type)},
                )
            if incident_severity is None:
                raise StatePreconditionException(
                    "Incident severity must be set before triaging.",
                    {"required": "severity_not_null"},
                )

        # Pre-condition: TRIAGED → DISPATCHED (type and severity must still be present)
        if (
            current_status == IncidentStatus.TRIAGED
            and target_status == IncidentStatus.DISPATCHED
        ):
            if incident_type is None or incident_severity is None:
                raise StatePreconditionException(
                    "Cannot dispatch: incident type/severity missing.",
                    {},
                )

        return target_status

    @staticmethod
    def can_transition(
        current_status: IncidentStatus,
        target_status: IncidentStatus,
    ) -> bool:
        """Non-raising check — useful for building UI state."""
        return target_status in TRANSITION_MAP.get(current_status, [])

    @staticmethod
    def allowed_transitions(current_status: IncidentStatus) -> list[IncidentStatus]:
        return TRANSITION_MAP.get(current_status, [])
