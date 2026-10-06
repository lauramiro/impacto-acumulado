-- BOE documents link to the readable page, not the XML. fetch stored the
-- summary's url_xml (https://www.boe.es/diario_boe/xml.php?id=..., served as
-- application/xml) as the document url, and the export shows that url as
-- "Ver en el BOE" and in the feeds. fetch now stores url_html
-- (https://www.boe.es/diario_boe/txt.php?id=..., same id). Nothing reads the
-- stored url to fetch text: fetch reads the XML from the day's summary.
-- An unchanged document is never rewritten by fetch, so the rows already
-- stored are moved here.
UPDATE raw_documents
SET url = replace(url, '/diario_boe/xml.php?id=', '/diario_boe/txt.php?id=')
WHERE source = 'boe'
  AND url LIKE 'https://www.boe.es/diario_boe/xml.php?id=%';
