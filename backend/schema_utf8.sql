BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 02940cb324e6

CREATE TYPE conversation_type AS ENUM ('CITIZEN', 'OPERATOR');

CREATE TYPE conversation_status AS ENUM ('ACTIVE', 'PAUSED', 'ENDED', 'ERROR');

CREATE TABLE conversations (
    id UUID NOT NULL, 
    incident_id UUID, 
    conversation_type conversation_type NOT NULL, 
    status conversation_status NOT NULL, 
    agent_state JSONB NOT NULL, 
    clarification_turns VARCHAR(8) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    ended_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id)
);

CREATE INDEX ix_conversations_incident_id ON conversations (incident_id);

CREATE TABLE event_outbox (
    id UUID NOT NULL, 
    channel VARCHAR(256) NOT NULL, 
    event_type VARCHAR(128) NOT NULL, 
    payload JSONB NOT NULL, 
    published BOOLEAN NOT NULL, 
    sequence_number BIGINT NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    published_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    UNIQUE (sequence_number)
);

CREATE INDEX ix_event_outbox_channel ON event_outbox (channel);

CREATE INDEX ix_event_outbox_published ON event_outbox (published);

CREATE TABLE idempotency_records (
    id UUID NOT NULL, 
    key VARCHAR(256) NOT NULL, 
    operation VARCHAR(128) NOT NULL, 
    result_id VARCHAR(256), 
    http_status INTEGER, 
    response_body JSONB, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_idempotency_records_key ON idempotency_records (key);

CREATE TYPE incident_status AS ENUM ('REPORTED', 'VERIFYING', 'TRIAGED', 'DISPATCHED', 'ON_SCENE', 'RESOLVED', 'CANCELLED');

CREATE TYPE incident_type AS ENUM ('MEDICAL', 'FIRE', 'CRIME', 'ACCIDENT', 'NATURAL_DISASTER', 'INFRASTRUCTURE', 'OTHER');

CREATE TYPE incident_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE incidents (
    id UUID NOT NULL, 
    reference_number VARCHAR(32) NOT NULL, 
    status incident_status NOT NULL, 
    type incident_type, 
    severity incident_severity, 
    description TEXT, 
    location_text TEXT, 
    latitude FLOAT, 
    longitude FLOAT, 
    address_resolved TEXT, 
    reporter_conversation_id UUID, 
    assigned_operator_id VARCHAR(256), 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    triaged_at TIMESTAMP WITH TIME ZONE, 
    dispatched_at TIMESTAMP WITH TIME ZONE, 
    resolved_at TIMESTAMP WITH TIME ZONE, 
    duplicate_of_id UUID, 
    duplicate_score FLOAT, 
    PRIMARY KEY (id), 
    FOREIGN KEY(duplicate_of_id) REFERENCES incidents (id)
);

CREATE UNIQUE INDEX ix_incidents_reference_number ON incidents (reference_number);

CREATE INDEX ix_incidents_status ON incidents (status);

CREATE TYPE responder_type AS ENUM ('POLICE', 'FIRE', 'MEDICAL', 'RESCUE', 'HAZMAT');

CREATE TYPE responder_status AS ENUM ('AVAILABLE', 'ASSIGNED', 'ON_ROUTE', 'ON_SCENE', 'RETURNING', 'OFFLINE');

CREATE TABLE responders (
    id UUID NOT NULL, 
    name VARCHAR(256) NOT NULL, 
    unit_id VARCHAR(64) NOT NULL, 
    responder_type responder_type NOT NULL, 
    status responder_status NOT NULL, 
    latitude FLOAT, 
    longitude FLOAT, 
    last_location_update TIMESTAMP WITH TIME ZONE, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id)
);

CREATE INDEX ix_responders_status ON responders (status);

CREATE UNIQUE INDEX ix_responders_unit_id ON responders (unit_id);

CREATE TABLE agent_runs (
    id UUID NOT NULL, 
    conversation_id UUID NOT NULL, 
    tools_called JSONB, 
    total_latency_ms INTEGER, 
    analysis_latency_ms INTEGER, 
    error_message TEXT, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(conversation_id) REFERENCES conversations (id)
);

CREATE INDEX ix_agent_runs_conversation_id ON agent_runs (conversation_id);

CREATE TYPE actor_role AS ENUM ('CITIZEN', 'OPERATOR', 'RESPONDER', 'ADMIN', 'SYSTEM');

CREATE TABLE audit_logs (
    id UUID NOT NULL, 
    incident_id UUID, 
    conversation_id UUID, 
    actor_id VARCHAR(256) NOT NULL, 
    actor_role actor_role NOT NULL, 
    action VARCHAR(128) NOT NULL, 
    before_state JSONB, 
    after_state JSONB, 
    metadata JSONB NOT NULL, 
    sequence_number BIGINT NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(conversation_id) REFERENCES conversations (id), 
    FOREIGN KEY(incident_id) REFERENCES incidents (id), 
    UNIQUE (sequence_number)
);

CREATE INDEX ix_audit_logs_action ON audit_logs (action);

CREATE INDEX ix_audit_logs_conversation_id ON audit_logs (conversation_id);

CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at);

CREATE INDEX ix_audit_logs_incident_id ON audit_logs (incident_id);

CREATE TABLE incident_facts (
    id UUID NOT NULL, 
    incident_id UUID NOT NULL, 
    fact_type VARCHAR(128) NOT NULL, 
    value JSONB NOT NULL, 
    confidence FLOAT NOT NULL, 
    source VARCHAR(64) NOT NULL, 
    is_current BOOLEAN NOT NULL, 
    superseded_by_id UUID, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(incident_id) REFERENCES incidents (id) ON DELETE CASCADE, 
    FOREIGN KEY(superseded_by_id) REFERENCES incident_facts (id)
);

CREATE INDEX ix_incident_facts_incident_id ON incident_facts (incident_id);

CREATE TABLE reporter_profiles (
    id UUID NOT NULL, 
    conversation_id UUID NOT NULL, 
    phone_number VARCHAR(32), 
    device_fingerprint VARCHAR(256), 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(conversation_id) REFERENCES conversations (id) ON DELETE CASCADE, 
    UNIQUE (conversation_id)
);

CREATE TYPE assignment_status AS ENUM ('PENDING', 'ACCEPTED', 'ON_ROUTE', 'ON_SCENE', 'COMPLETED', 'CANCELLED');

CREATE TABLE responder_assignments (
    id UUID NOT NULL, 
    incident_id UUID NOT NULL, 
    responder_id UUID NOT NULL, 
    status assignment_status NOT NULL, 
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    accepted_at TIMESTAMP WITH TIME ZONE, 
    arrived_at TIMESTAMP WITH TIME ZONE, 
    completed_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(incident_id) REFERENCES incidents (id) ON DELETE CASCADE, 
    FOREIGN KEY(responder_id) REFERENCES responders (id)
);

CREATE INDEX ix_responder_assignments_incident_id ON responder_assignments (incident_id);

CREATE INDEX ix_responder_assignments_responder_id ON responder_assignments (responder_id);

CREATE TABLE transcripts (
    id UUID NOT NULL, 
    conversation_id UUID NOT NULL, 
    role VARCHAR(32) NOT NULL, 
    content TEXT NOT NULL, 
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
);

CREATE INDEX ix_transcripts_conversation_id ON transcripts (conversation_id);

CREATE TYPE session_status AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED', 'ERROR');

CREATE TABLE voice_sessions (
    id UUID NOT NULL, 
    conversation_id UUID NOT NULL, 
    session_token VARCHAR(512) NOT NULL, 
    assemblyai_session_id VARCHAR(256), 
    role actor_role NOT NULL, 
    status session_status NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    ended_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(conversation_id) REFERENCES conversations (id) ON DELETE CASCADE, 
    UNIQUE (session_token)
);

CREATE INDEX ix_voice_sessions_conversation_id ON voice_sessions (conversation_id);

CREATE TYPE tool_execution_status AS ENUM ('SUCCESS', 'INVALID_ARGUMENTS', 'UNAUTHORIZED', 'DOMAIN_RULE_VIOLATION', 'EXECUTION_FAILED', 'TIMEOUT', 'UNKNOWN_TOOL');

CREATE TABLE tool_calls (
    id UUID NOT NULL, 
    agent_run_id UUID NOT NULL, 
    tool_name VARCHAR(128) NOT NULL, 
    arguments JSONB NOT NULL, 
    result JSONB, 
    execution_status tool_execution_status NOT NULL, 
    error_message TEXT, 
    latency_ms INTEGER, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(agent_run_id) REFERENCES agent_runs (id) ON DELETE CASCADE
);

INSERT INTO alembic_version (version_num) VALUES ('02940cb324e6') RETURNING alembic_version.version_num;

-- Running upgrade 02940cb324e6 -> d33cabdd1d3d

ALTER TABLE audit_logs ALTER COLUMN sequence_number DROP NOT NULL;

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_sequence_number_key;

ALTER TABLE conversations ADD FOREIGN KEY(incident_id) REFERENCES incidents (id);

ALTER TABLE event_outbox ALTER COLUMN sequence_number DROP NOT NULL;

ALTER TABLE event_outbox DROP CONSTRAINT event_outbox_sequence_number_key;

ALTER TABLE incidents ADD FOREIGN KEY(reporter_conversation_id) REFERENCES conversations (id);

UPDATE alembic_version SET version_num='d33cabdd1d3d' WHERE alembic_version.version_num = '02940cb324e6';

-- Running upgrade d33cabdd1d3d -> d14572b7190f

ALTER TABLE conversations ALTER COLUMN clarification_turns TYPE INTEGER USING clarification_turns::integer;

UPDATE alembic_version SET version_num='d14572b7190f' WHERE alembic_version.version_num = 'd33cabdd1d3d';

COMMIT;

