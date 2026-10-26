-- Agent icons became cell types; map the former geometric shapes.
UPDATE agents SET shape=CASE shape
 WHEN 'circular' THEN 'animal' WHEN 'oval' THEN 'hemacia' WHEN 'capsula' THEN 'bacilo' WHEN 'gota' THEN 'euglena'
 WHEN 'triangular' THEN 'paramecio' WHEN 'hexagonal' THEN 'vegetal' WHEN 'nuvem' THEN 'leucocito' ELSE shape END;
