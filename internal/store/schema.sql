CREATE TABLE {s}.users (
	id            uuid PRIMARY KEY,
	email         text NOT NULL UNIQUE,
	name          text NOT NULL,
	password_hash text NOT NULL,
	is_owner      boolean NOT NULL DEFAULT false,
	created_at    timestamptz NOT NULL DEFAULT now(),
	must_change_password boolean NOT NULL DEFAULT false
);

CREATE TABLE {s}.sessions (
	token_hash bytea PRIMARY KEY,
	user_id    uuid NOT NULL REFERENCES {s}.users (id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON {s}.sessions (user_id);

CREATE TABLE {s}.portfolios (
	id         uuid PRIMARY KEY,
	name       text NOT NULL,
	slug       text NOT NULL,
	icon       text NOT NULL DEFAULT 'account_balance_wallet',
	color      text NOT NULL DEFAULT '#006c4b',
	currency   text NOT NULL DEFAULT 'INR',
	fy_start   smallint NOT NULL DEFAULT 4 CHECK (fy_start BETWEEN 1 AND 12),
	settings   jsonb NOT NULL DEFAULT '{}',
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX portfolios_slug ON {s}.portfolios (slug);

CREATE TABLE {s}.portfolio_members (
	portfolio_id uuid NOT NULL REFERENCES {s}.portfolios (id) ON DELETE CASCADE,
	user_id      uuid NOT NULL REFERENCES {s}.users (id) ON DELETE CASCADE,
	PRIMARY KEY (portfolio_id, user_id)
);

CREATE TABLE {s}.sections (
	id           uuid PRIMARY KEY,
	portfolio_id uuid NOT NULL REFERENCES {s}.portfolios (id) ON DELETE CASCADE,
	kind         text NOT NULL,
	name         text NOT NULL,
	icon         text NOT NULL,
	description  text NOT NULL DEFAULT '',
	valuation    text NOT NULL,
	rate         numeric,
	value_field  text NOT NULL DEFAULT '',
	cost_field   text NOT NULL DEFAULT '',
	date_field   text NOT NULL DEFAULT '',
	fields       jsonb NOT NULL,
	counts       boolean NOT NULL DEFAULT true,
	position     integer NOT NULL DEFAULT 0,
	created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sections_portfolio_idx ON {s}.sections (portfolio_id);
CREATE UNIQUE INDEX sections_one_per_kind ON {s}.sections (portfolio_id, kind) WHERE kind <> 'custom';

CREATE TABLE {s}.imports (
	id         uuid PRIMARY KEY,
	section_id uuid NOT NULL REFERENCES {s}.sections (id) ON DELETE CASCADE,
	source     text NOT NULL,
	added      integer NOT NULL,
	skipped    integer NOT NULL,
	user_id    uuid REFERENCES {s}.users (id) ON DELETE SET NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX imports_section_idx ON {s}.imports (section_id);

CREATE TABLE {s}.rows (
	id         uuid PRIMARY KEY,
	section_id uuid NOT NULL REFERENCES {s}.sections (id) ON DELETE CASCADE,
	data       jsonb NOT NULL,
	row_hash   text NOT NULL,
	import_id  uuid REFERENCES {s}.imports (id) ON DELETE SET NULL,
	-- Demat statements are the only PDFs that put shares and bonds in, and they carry no cost.
	basis      text NOT NULL DEFAULT '',
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (section_id, row_hash)
);

CREATE TABLE {s}.holdings (
	section_id uuid NOT NULL REFERENCES {s}.sections (id) ON DELETE CASCADE,
	key        text NOT NULL,
	isin       text NOT NULL DEFAULT '',
	symbol     text NOT NULL DEFAULT '',
	name       text NOT NULL DEFAULT '',
	quantity   numeric NOT NULL,
	cost       numeric NOT NULL,
	realised   numeric NOT NULL DEFAULT 0,
	first_date date,
	cost_unknown boolean NOT NULL DEFAULT false,
	PRIMARY KEY (section_id, key)
);

CREATE TABLE {s}.templates (
	id           uuid PRIMARY KEY,
	portfolio_id uuid NOT NULL REFERENCES {s}.portfolios (id) ON DELETE CASCADE,
	kind         text NOT NULL,
	name         text NOT NULL,
	payload      jsonb NOT NULL,
	created_at   timestamptz NOT NULL DEFAULT now(),
	UNIQUE (portfolio_id, kind, name)
);

CREATE TABLE {s}.securities (
	isin       text PRIMARY KEY,
	symbol     text NOT NULL DEFAULT '',
	bse_code   text NOT NULL DEFAULT '',
	name       text NOT NULL DEFAULT '',
	kind       text NOT NULL,
	category   text NOT NULL DEFAULT '',
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE {s}.prices (
	isin   text NOT NULL,
	day    date NOT NULL,
	close  numeric NOT NULL,
	source text NOT NULL,
	PRIMARY KEY (isin, day)
);

CREATE TABLE {s}.index_closes (
	name  text NOT NULL,
	day   date NOT NULL,
	close numeric NOT NULL,
	pe    numeric,
	pb    numeric,
	dy    numeric,
	PRIMARY KEY (name, day)
);

CREATE TABLE {s}.snapshots (
	portfolio_id uuid NOT NULL REFERENCES {s}.portfolios (id) ON DELETE CASCADE,
	day          date NOT NULL,
	net_worth    numeric NOT NULL,
	invested     numeric NOT NULL,
	PRIMARY KEY (portfolio_id, day)
);

CREATE TABLE {s}.job_runs (
	id           bigserial PRIMARY KEY,
	job          text NOT NULL,
	portfolio_id uuid REFERENCES {s}.portfolios (id) ON DELETE CASCADE,
	started_at   timestamptz NOT NULL DEFAULT now(),
	finished_at  timestamptz,
	ok           boolean,
	message      text NOT NULL DEFAULT '',
	facts        jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX job_runs_job_idx ON {s}.job_runs (job, started_at DESC);

CREATE TABLE {s}.settings (
	key   text PRIMARY KEY,
	value jsonb NOT NULL
);

CREATE TABLE {s}.news (
	id           bigserial PRIMARY KEY,
	portfolio_id uuid NOT NULL REFERENCES {s}.portfolios (id) ON DELETE CASCADE,
	link         text NOT NULL,
	title        text NOT NULL,
	source       text NOT NULL DEFAULT '',
	snippet      text NOT NULL DEFAULT '',
	published_at timestamptz,
	scrips       text[] NOT NULL DEFAULT '{}',
	about        text[] NOT NULL DEFAULT '{}',
	verdict      text NOT NULL DEFAULT '',
	category     text NOT NULL DEFAULT '',
	reason       text NOT NULL DEFAULT '',
	also         int NOT NULL DEFAULT 0,
	fetched_at   timestamptz NOT NULL DEFAULT now(),
	UNIQUE (portfolio_id, link)
);
CREATE INDEX news_portfolio_idx ON {s}.news (portfolio_id, published_at DESC);

-- Ebenezer's notes as the model wrote them, keyed by the plain fact each one says, so a fact that
-- has not changed keeps its wording and only new facts go back to the model.
CREATE TABLE {s}.voiced_notes (
	portfolio_id uuid PRIMARY KEY REFERENCES {s}.portfolios (id) ON DELETE CASCADE,
	voice        text NOT NULL,
	lines        jsonb NOT NULL DEFAULT '{}',
	updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE {s}.cards (
	id                uuid PRIMARY KEY,
	portfolio_id      uuid NOT NULL REFERENCES {s}.portfolios (id) ON DELETE CASCADE,
	kind              text NOT NULL CHECK (kind IN ('credit', 'charge')),
	bank              text NOT NULL,
	name              text NOT NULL,
	nickname          text NOT NULL DEFAULT '',
	network           text NOT NULL DEFAULT '',
	color             text NOT NULL,
	credit_limit      numeric,
	statement_day     smallint NOT NULL CHECK (statement_day BETWEEN 1 AND 31),
	due_days          smallint NOT NULL CHECK (due_days BETWEEN 1 AND 60),
	interest          numeric,
	annual_fee        numeric,
	-- Where the card stood when Ebenezer started counting; spends after statement_on add to it.
	statement_on      date NOT NULL,
	statement_balance numeric NOT NULL DEFAULT 0,
	paid              numeric NOT NULL DEFAULT 0,
	spent_before      numeric NOT NULL DEFAULT 0,
	position          integer NOT NULL DEFAULT 0,
	created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cards_portfolio_idx ON {s}.cards (portfolio_id);

CREATE TABLE {s}.spend_imports (
	id           uuid PRIMARY KEY,
	portfolio_id uuid NOT NULL REFERENCES {s}.portfolios (id) ON DELETE CASCADE,
	source       text NOT NULL,
	added        integer NOT NULL,
	skipped      integer NOT NULL,
	user_id      uuid REFERENCES {s}.users (id) ON DELETE SET NULL,
	created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE {s}.spend_categories (
	portfolio_id uuid NOT NULL REFERENCES {s}.portfolios (id) ON DELETE CASCADE,
	name         text NOT NULL,
	icon         text NOT NULL,
	PRIMARY KEY (portfolio_id, name)
);

-- paid_with is card:<id>, account:<savings row id>, cash, or empty when not known.
CREATE TABLE {s}.spends (
	id           uuid PRIMARY KEY,
	portfolio_id uuid NOT NULL REFERENCES {s}.portfolios (id) ON DELETE CASCADE,
	day          date NOT NULL,
	item         text NOT NULL,
	amount       numeric NOT NULL,
	category     text NOT NULL DEFAULT '',
	paid_with    text NOT NULL DEFAULT '',
	asking       boolean NOT NULL DEFAULT false,
	note         text NOT NULL DEFAULT '',
	import_id    uuid REFERENCES {s}.spend_imports (id) ON DELETE CASCADE,
	row_hash     text,
	created_at   timestamptz NOT NULL DEFAULT now(),
	UNIQUE (portfolio_id, row_hash)
);
CREATE INDEX spends_portfolio_day_idx ON {s}.spends (portfolio_id, day DESC);
