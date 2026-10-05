-- Documents a person has read in the review queue (impacto review-clusters)
-- and judged to belong where resolve put them. A group whose documents are
-- all acknowledged or keyed leaves the count; a new document joining it
-- brings it back. Resolve does not read this table.
CREATE TABLE review_acknowledgements (
  document_id  bigint PRIMARY KEY REFERENCES raw_documents (id) ON DELETE CASCADE,
  note         text NOT NULL
);
