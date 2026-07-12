-- Vincula os 5 recursos produtivos reais as tecnologias aplicadas
-- correspondentes, com base em auditoria manual de nome/grupo (ver
-- discussao de elegibilidade para a Simulacao Comercial de Capacidade).
-- Mapeamento por codigo, casado tambem por empresa_id por seguranca.
update public.recursos_produtivos rp
set tecnologia_aplicada_id = ta.id
from public.tecnologias_aplicadas ta
where rp.deleted_at is null
  and ta.deleted_at is null
  and rp.empresa_id = ta.empresa_id
  and (rp.codigo, ta.codigo) in (
    ('CNC-001', '007'), -- CNC1000 -> CNC ate 1000 (3 eixos)
    ('F001', '004'),    -- Fresadora -> Fresa Convencional
    ('TC003', '005'),   -- TORNO003 -> Torno CNC
    ('TCN001', '005'),  -- Torno CN1 -> Torno CNC
    ('TCN002', '005')   -- Torno CN2 -> Torno CNC
  );
