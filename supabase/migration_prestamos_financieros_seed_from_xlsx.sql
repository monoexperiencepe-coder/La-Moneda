-- Auto-generado por scripts/generate_prestamos_financieros_migration_seed.mjs
-- Fuente: C:/Users/alkan/Downloads/aportes_prestamos_normalizado_migracion_v2_moneda.xlsx
-- empresa_id fijo (debe existir en public.empresas): 07593982-08e6-450c-8abe-4bf590609dd7
-- Idempotente: préstamos por (empresa_id, codigo); tramos por (prestamo_financiero_id, orden).

create unique index if not exists prestamos_tramos_prestamo_orden_uidx
  on public.prestamos_tramos (prestamo_financiero_id, orden);

do $$
declare
  eid uuid;
  eid_override uuid := '07593982-08e6-450c-8abe-4bf590609dd7'::uuid;
begin
  if eid_override is not null then
    eid := eid_override;
  else
    select emp.id into eid from public.empresas emp order by emp.id asc limit 1;
  end if;
  if eid is null then
    raise notice 'seed prestamos: sin empresas — revisa eid_override / tabla empresas';
    return;
  end if;
  if not exists (select 1 from public.empresas where id = eid) then
    raise exception 'seed prestamos: empresa_id % no existe en public.empresas', eid;
  end if;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P001_ASV_PRESTAMO_SE_DEBE_21_22',
      'ASV',
      'USD',
      10700,
      10700,
      0.12,
      107,
      '2020-09-29'::date,
      'activo',
      NULL,
      false,
      'Préstamo paralelo en la tabla O:R. Se mantiene pago mensual 107 según dueño. Pagos históricos ya están en gastos; no insertar cuotas.'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P002_JUDY_ASV_PRESTAMO_SE_DEBE_21_22',
      'JUDY - ASV',
      'USD',
      10500,
      7500,
      0.12,
      75,
      '2020-09-29'::date,
      'activo',
      NULL,
      true,
      'Caso especial: pago mensual bajó de 105 a 85 tras retiro de 2,000 USD y luego a 75 tras retiro adicional de 1,000 USD. Usar tramos_interes.'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P003_ASV_PRESTAMO_SE_DEBE_27_BRE_284',
      'ASV',
      'USD',
      13053,
      13053,
      0.16,
      174.04,
      '2022-04-28'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja.'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P004_ASV_PRESTAMO_SE_DEBE_28_BRL_073',
      'ASV',
      'USD',
      11700,
      11700,
      0.16,
      156,
      '2022-05-14'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja.'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P005_TIA_JUDY_PRESTAMO_TIA_JUDY_COMPRA_NUEVOS_AUTO',
      'TIA JUDY',
      'PEN',
      133000,
      133000,
      0.12,
      1330,
      '2024-03-30'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja.'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P006_ASV_PRESTAMO_SE_DEBE_CARRO_26_BJM_588',
      'ASV',
      'USD',
      10600,
      10600,
      0.16,
      141.33,
      '2022-03-21'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja.'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P007_FERNANDO_PRESTAMO_FERNANDO_ARGENTINO',
      'FERNANDO',
      'USD',
      1400,
      1400,
      0.1,
      11.67,
      '2024-03-18'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja. | Excel moneda=REVISAR; revisión: moneda_no_determinada'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P008_ASB_FLACO_PRESTAMO_SE_DEBE_30_BLF_037',
      'ASB /FLACO',
      'USD',
      11000,
      11000,
      0.16,
      146.67,
      '2022-09-01'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja.'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P009_ASV_PRESTAMO_ASV_COMPRA_AUTOS_PP_15_LE_DEBE_A',
      'ASV',
      'PEN',
      295000,
      295000,
      0.15,
      3687.5,
      '2025-07-10'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja.'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P010_ASV_PRESTAMO_ASV',
      'ASV',
      'USD',
      11250,
      11250,
      0.1066,
      99.94,
      '2023-08-18'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja. | Excel moneda=REVISAR; revisión: moneda_no_determinada'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P011_RAMIRO_PRESTAMO_TIO_RAMIRO_PRESTAMO_SANTANDER',
      'RAMIRO',
      'USD',
      2000,
      2000,
      0.09,
      15,
      '2024-03-20'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja. | Excel moneda=REVISAR; revisión: moneda_no_determinada'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P012_TIA_JUDY_PRESTAMO_TIA_JUDY_COMPRA_NUEVOS_AUTO',
      'TIA JUDY',
      'USD',
      3687,
      3687,
      0.14,
      43.02,
      '2024-06-26'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja. | Excel moneda=REVISAR; revisión: moneda_no_determinada'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P013_CAROLINA_PRESTAMO_CARO_EFECTIVO',
      'CAROLINA',
      'USD',
      23000,
      23000,
      0.12,
      230,
      '2025-11-19'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja. | Excel moneda=REVISAR; revisión: moneda_no_determinada'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P014_RAMIRO_PRESTAMO_RAMIRO_PRESTAMO_TERRENO',
      'RAMIRO',
      'USD',
      10000,
      10000,
      0.09,
      75,
      '2024-06-29'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja. | Excel moneda=REVISAR; revisión: moneda_no_determinada'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P015_ASV_PRESTAMO_ASV',
      'ASV',
      'USD',
      2000,
      2000,
      0.1,
      16.67,
      '2023-08-28'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja. | Excel moneda=REVISAR; revisión: moneda_no_determinada'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P016_ASV_PRESTAMO_ASV_COMPRA_NUEVOS_AUTOS',
      'ASV',
      'PEN',
      200000,
      200000,
      0.14,
      2333.33,
      '2024-03-30'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja.'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P017_RAMIRO_PRESTAMO_TIO_RAMIRO',
      'RAMIRO',
      'USD',
      3000,
      3000,
      0.09,
      22.5,
      '2023-08-10'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja. | Excel moneda=REVISAR; revisión: moneda_no_determinada'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P018_TIA_JUDY_PRESTAMO_QUE_PAPA_LE_DEBIA_POR_EMPRE',
      'TIA JUDY',
      'USD',
      2335,
      2335,
      0.09,
      17.51,
      '2019-07-22'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja. | Excel moneda=REVISAR; revisión: moneda_no_determinada'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

  insert into public.prestamos_financieros (
      empresa_id, codigo, prestamista, moneda, monto_original, capital_actual_estimado,
      tasa_anual, interes_mensual_actual, fecha_inicio, estado, fecha_cancelacion,
      requiere_tramos, notas
    ) values (
      eid,
      'P019_ASV_PRESTAMO_SE_DEBE_33_BVL_654',
      'ASV',
      'USD',
      12420,
      12420,
      0.16,
      165.6,
      '2022-11-28'::date,
      'activo',
      NULL,
      false,
      'Cabecera detectada; pagos históricos ya están en gastos y NO deben insertarse como movimientos. Tasa anual pagada mensualmente porque coincide con los importes de interés de la hoja.'
    )
    on conflict (empresa_id, codigo) where (btrim(codigo) <> '')
    do update set
      prestamista = excluded.prestamista,
      moneda = excluded.moneda,
      monto_original = excluded.monto_original,
      capital_actual_estimado = excluded.capital_actual_estimado,
      tasa_anual = excluded.tasa_anual,
      interes_mensual_actual = excluded.interes_mensual_actual,
      fecha_inicio = excluded.fecha_inicio,
      estado = excluded.estado,
      fecha_cancelacion = excluded.fecha_cancelacion,
      requiere_tramos = excluded.requiere_tramos,
      notas = excluded.notas;

end $$;

do $$
declare
  eid uuid;
  eid_override uuid := '07593982-08e6-450c-8abe-4bf590609dd7'::uuid;
  pid bigint;
begin
  if eid_override is not null then
    eid := eid_override;
  else
    select emp.id into eid from public.empresas emp order by emp.id asc limit 1;
  end if;
  if eid is null then return;
  end if;

  select pf.id into pid from public.prestamos_financieros pf
    where pf.empresa_id = eid and pf.codigo = 'P002_JUDY_ASV_PRESTAMO_SE_DEBE_21_22' limit 1;
  if pid is not null then
    insert into public.prestamos_tramos (
      prestamo_financiero_id, moneda, capital_referencial, tasa_anual, interes_mensual,
      desde, hasta, evento, nota, orden
    ) values (
      pid,
      'USD',
      10500,
      0.12,
      105,
      '2020-11-06'::date,
      '2026-02-28'::date,
      'inicio',
      'Tramo histórico con pago mensual 105.',
      1
    )
    on conflict (prestamo_financiero_id, orden) do update set
      moneda = excluded.moneda,
      capital_referencial = excluded.capital_referencial,
      tasa_anual = excluded.tasa_anual,
      interes_mensual = excluded.interes_mensual,
      desde = excluded.desde,
      hasta = excluded.hasta,
      evento = excluded.evento,
      nota = excluded.nota;
  end if;

  select pf.id into pid from public.prestamos_financieros pf
    where pf.empresa_id = eid and pf.codigo = 'P002_JUDY_ASV_PRESTAMO_SE_DEBE_21_22' limit 1;
  if pid is not null then
    insert into public.prestamos_tramos (
      prestamo_financiero_id, moneda, capital_referencial, tasa_anual, interes_mensual,
      desde, hasta, evento, nota, orden
    ) values (
      pid,
      'USD',
      8500,
      0.12,
      85,
      '2026-03-01'::date,
      '2026-04-30'::date,
      'retiro_capital_2000',
      'Retiró 2,000 USD; pago mensual bajó a 85.',
      2
    )
    on conflict (prestamo_financiero_id, orden) do update set
      moneda = excluded.moneda,
      capital_referencial = excluded.capital_referencial,
      tasa_anual = excluded.tasa_anual,
      interes_mensual = excluded.interes_mensual,
      desde = excluded.desde,
      hasta = excluded.hasta,
      evento = excluded.evento,
      nota = excluded.nota;
  end if;

  select pf.id into pid from public.prestamos_financieros pf
    where pf.empresa_id = eid and pf.codigo = 'P002_JUDY_ASV_PRESTAMO_SE_DEBE_21_22' limit 1;
  if pid is not null then
    insert into public.prestamos_tramos (
      prestamo_financiero_id, moneda, capital_referencial, tasa_anual, interes_mensual,
      desde, hasta, evento, nota, orden
    ) values (
      pid,
      'USD',
      7500,
      0.12,
      75,
      '2026-05-01'::date,
      NULL,
      'retiro_capital_1000',
      'Retiró 1,000 USD adicional; pago mensual vigente 75.',
      3
    )
    on conflict (prestamo_financiero_id, orden) do update set
      moneda = excluded.moneda,
      capital_referencial = excluded.capital_referencial,
      tasa_anual = excluded.tasa_anual,
      interes_mensual = excluded.interes_mensual,
      desde = excluded.desde,
      hasta = excluded.hasta,
      evento = excluded.evento,
      nota = excluded.nota;
  end if;

end $$;
