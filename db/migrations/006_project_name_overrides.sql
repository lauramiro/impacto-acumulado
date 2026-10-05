-- A name set by hand for the project a document belongs to, for groups whose
-- extracted names say nothing ("Planta Solar Fotovoltaica"). Resolve uses it
-- over any extracted name; the note says where the name was read.
CREATE TABLE project_name_overrides (
  document_id  bigint PRIMARY KEY REFERENCES raw_documents (id) ON DELETE CASCADE,
  name         text NOT NULL,
  note         text NOT NULL
);
