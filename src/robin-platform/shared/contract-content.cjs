/**
 * Contenido de los cinco contratos 2027 (revisión integrada).
 * Fuente única para la vista previa del onboarding y el PDF firmado.
 */

const PRIVACY_EMAIL = 'hello@project-robin.com';

const INTRO_ADMISSIONS = {
  type: 'p',
  text: 'PROJECT ROBIN STUDENTS MOBILITY S.L., con domicilio en Calle Covarrubias 9, 28010 Madrid, Comunidad de Madrid, España, NIF B75355057, en adelante PROJECT ROBIN STUDENTS MOBILITY S.L., y la persona cuyos datos se consignan a continuación, en adelante El Cliente, acuerdan las siguientes condiciones en relación con la prestación de servicios de consultoría académica y mentoría para la aplicación a universidades en los Países Bajos.',
};

const INTRO_TRANSITION = {
  type: 'p',
  text: 'PROJECT ROBIN STUDENTS MOBILITY S.L., con domicilio en Calle Covarrubias 9, 28010 Madrid, Comunidad de Madrid, España, NIF B75355057, en adelante PROJECT ROBIN STUDENTS MOBILITY S.L., y la persona cuyos datos se consignan a continuación, en adelante El Cliente, acuerdan las siguientes condiciones en relación con la prestación de servicios de consultoría académica y mentoría para la transición a la vida universitaria en los Países Bajos.',
};

const DATOS_PARTES = [
  { type: 'h3', text: 'Datos de las partes' },
  { type: 'p', text: 'Nombre y apellidos del tutor legal: {{CLIENTE_NOMBRE}}' },
  { type: 'p', text: 'Dirección completa: {{DIRECCION}}' },
  { type: 'p', text: 'Nombre y apellidos del alumno: {{ALUMNO_NOMBRE}}' },
  { type: 'p', text: '{{ALUMNO_DOC_LABEL}} del alumno: {{ALUMNO_DOC}}' },
  { type: 'p', text: '{{CLIENTE_DOC_LABEL}} del tutor legal: {{CLIENTE_DOC}}' },
];

const ALOJAMIENTO_PARTNER = [
  { type: 'h3', text: 'Alojamiento garantizado en residencia partner' },
  { type: 'p', text: 'PROJECT ROBIN STUDENTS MOBILITY S.L. se compromete a garantizar al alumno al menos una opción de alojamiento de calidad en una residencia partner de Project Robin situada en la ciudad de destino correspondiente a sus estudios.' },
  { type: 'p', text: 'Esta garantía consiste en poner a disposición del alumno una opción efectiva de alojamiento y no implica la presentación de un amplio abanico de residencias o alternativas. Project Robin realizará las coordinaciones necesarias con la residencia partner para hacer efectiva dicha opción.' },
  { type: 'p', text: 'El Cliente deberá facilitar la documentación requerida, cumplir los plazos comunicados y abonar directamente los pagos, depósitos, fianzas o demás importes exigidos por la residencia, salvo que se acuerde expresamente lo contrario.' },
  { type: 'p', text: 'Si la opción inicialmente prevista dejara de estar disponible por causas ajenas a Project Robin, la Empresa facilitará una alternativa de calidad equivalente en otra residencia partner de la misma ciudad.' },
];

const DURACION = [
  { type: 'p', text: 'Salvo que se indique expresamente lo contrario, los servicios incluidos en el precio del presente contrato se prestarán hasta el 14 de septiembre de 2027.' },
  { type: 'p', text: 'A partir del 15 de septiembre de 2027, todos los servicios de acompañamiento, soporte, consultoría, mentoría, comunidad y cualesquiera otros servicios continuados pasarán a formar parte del programa de suscripción ROBIN. Su continuidad desde esa fecha requerirá la contratación y el mantenimiento activo de la suscripción correspondiente.' },
  { type: 'p', text: 'Este cambio no afectará a las obligaciones ya devengadas por las partes ni a las actuaciones que deban completarse antes del 15 de septiembre de 2027 conforme al presente contrato.' },
];

const FORMA_PAGO_BASE = [
  { type: 'p', text: 'El Cliente se compromete a realizar el pago mediante la pasarela de pagos habilitada en el portal del cliente con un máximo de 7 días hábiles una vez desbloqueado el pago correspondiente.' },
  { type: 'p', text: 'Alternativamente, se podrá efectuar el pago mediante transferencia bancaria a la cuenta de La Empresa, según los siguientes detalles:' },
  { type: 'p', text: 'Cuenta bancaria: 00815330760002187930\nBanco: Banco Sabadell\nBeneficiario: PROJECT ROBIN STUDENTS MOBILITY\nIBAN: ES5200815330760002187930\nSWIFT/BIC: BSABESBB' },
];

const PAYMENT_DEFAULTS = [
  { type: 'p', text: 'En caso de retraso o incumplimiento en cualquiera de los pagos establecidos en el presente contrato, PROJECT ROBIN STUDENTS MOBILITY S.L. se reserva el derecho de suspender temporalmente la prestación de los servicios hasta la regularización de las cantidades pendientes.' },
  { type: 'p', text: 'Asimismo, transcurrido el plazo de pago establecido sin que El Cliente haya satisfecho las cantidades adeudadas, PROJECT ROBIN STUDENTS MOBILITY S.L. podrá reclamar judicial o extrajudicialmente la deuda y, en cumplimiento de la normativa vigente, podrá comunicar los datos relativos al impago a sistemas comunes de información crediticia o registros de morosidad, siempre que se cumplan los requisitos legales aplicables.' },
];

const FORMA_PAGO_ADMISSIONS = [
  ...FORMA_PAGO_BASE,
  { type: 'p', text: 'Cada pago deberá efectuarse en los plazos establecidos según el progreso de los servicios, salvo disputa formal. El primer pago será un requisito indispensable para iniciar la prestación de los servicios. El segundo pago será obligatorio tras la confirmación de que las aplicaciones han sido enviadas. El tercer pago será requerido tras la notificación de aceptación en al menos una universidad.' },
  ...PAYMENT_DEFAULTS,
];

const FORMA_PAGO_SERVICE = [
  ...FORMA_PAGO_BASE,
  { type: 'p', text: 'Cada pago deberá efectuarse en los plazos establecidos según el progreso de los servicios, salvo disputa formal. El primer pago será un requisito indispensable para iniciar la prestación de los servicios. Los pagos posteriores serán exigibles conforme a la división de pagos y a los hitos indicados en el presente contrato.' },
  ...PAYMENT_DEFAULTS,
];

const RESPONSABILIDAD_ADMISSIONS = [
  { type: 'p', text: 'La Empresa proporcionará los servicios de consultoría, mentoría y, cuando corresponda, formación académica de acuerdo con su experiencia, conocimientos y recursos disponibles. PROJECT ROBIN STUDENTS MOBILITY S.L. empleará de buena fe y con diligencia profesional los medios razonablemente necesarios para la correcta gestión del proceso, sin que pueda garantizar la aceptación o admisión del alumno, por depender esta decisión de las universidades y de otros factores externos.' },
  { type: 'p', text: 'Los requisitos específicos de admisión, el desempeño académico y personal del alumno, las decisiones de las universidades y los cambios de políticas o criterios de admisión que no hayan sido comunicados a la Empresa se encuentran fuera del control de PROJECT ROBIN STUDENTS MOBILITY S.L. y pueden influir en el resultado del proceso.' },
  { type: 'p', text: 'Cuando la carga, presentación o envío de documentos, solicitudes o formularios forme parte de los servicios contratados, PROJECT ROBIN STUDENTS MOBILITY S.L. será responsable de realizar estas actuaciones dentro de los plazos oficiales aplicables y de introducir, transcribir y remitir correctamente la información proporcionada por El Cliente, siempre que este haya entregado la documentación necesaria de forma completa, veraz y con antelación suficiente.' },
  { type: 'p', text: 'La Empresa no responderá por retrasos, errores o resultados adversos derivados de documentación incompleta, inexacta o entregada fuera de plazo por El Cliente, de cambios o decisiones de terceros, de fallos técnicos de plataformas externas fuera de su control o de supuestos de fuerza mayor. Esta limitación no será aplicable a errores, omisiones o retrasos directamente imputables a PROJECT ROBIN STUDENTS MOBILITY S.L.' },
  { type: 'p', text: 'Asimismo, PROJECT ROBIN STUDENTS MOBILITY S.L. mantendrá el compromiso de no realizar ni reclamar el pago de la última cuota cuando dicha cuota se encuentre expresamente condicionada a la aceptación del alumno en al menos una universidad y esa aceptación no se produzca.' },
];

const DERECHO_ADMISION_ADMISSIONS = [
  { type: 'p', text: 'Project Robin se reserva el derecho de admisión a sus servicios de consultoría y mentoría académica. La Empresa evaluará las características y cualidades de cada alumno antes de aceptar su solicitud, considerando factores como su historial académico, actitud, compromiso y viabilidad de éxito en el proceso de admisión a universidades en los Países Bajos. En caso de que Project Robin considere que las condiciones del alumno no son adecuadas para garantizar un uso eficiente de los servicios ofrecidos, se reserva el derecho de no admitir al cliente, en beneficio del éxito del proceso para ambas partes.' },
];

const OBLIGACIONES_ADMISSIONS = [
  { type: 'p', text: 'El Cliente se compromete a colaborar activamente durante el proceso de asesoría, proporcionando toda la información y documentación necesaria de manera completa y veraz, así como los documentos solicitados en tiempo y forma para cumplir con los plazos aplicables.' },
  { type: 'p', text: 'Si El Cliente incumple estas obligaciones, PROJECT ROBIN STUDENTS MOBILITY S.L. no será responsable de los retrasos, errores o resultados adversos que deriven directa y exclusivamente de dicho incumplimiento. Esta previsión no excluirá la responsabilidad de la Empresa por sus propios errores, omisiones o retrasos.' },
];

const JURISDICCION_ADMISSIONS = [
  { type: 'p', text: 'Este contrato se regirá por las leyes de España, y cualquier disputa que surja en relación con el mismo se someterá a la jurisdicción de los tribunales competentes en Madrid, Comunidad de Madrid, España.' },
];

const PRIVACIDAD_DETALLADA = [
  { type: 'p', text: 'PROJECT ROBIN STUDENTS MOBILITY S.L. se compromete a tratar los datos personales del Cliente y/o del alumno conforme a la legislación vigente en materia de protección de datos, incluyendo el Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo (RGPD) y la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales.' },
  { type: 'p', text: 'a. Finalidad del tratamiento: Los datos personales proporcionados por El Cliente serán utilizados exclusivamente para la prestación de los servicios contratados, incluyendo la asesoría y mentoría académica, así como la gestión de los trámites administrativos necesarios para el proceso de admisión en las universidades seleccionadas.' },
  { type: 'p', text: 'b. Confidencialidad y seguridad: PROJECT ROBIN STUDENTS MOBILITY S.L. implementará las medidas técnicas y organizativas necesarias para garantizar la seguridad de los datos personales y evitar su alteración, pérdida, tratamiento o acceso no autorizado.' },
  { type: 'p', text: `c. Derechos del Cliente: El Cliente tiene derecho a acceder, rectificar, suprimir, limitar el tratamiento, oponerse y solicitar la portabilidad de sus datos personales. Para ejercer estos derechos, podrá remitir su solicitud al siguiente contacto de privacidad: ${PRIVACY_EMAIL}.` },
  { type: 'p', text: 'd. Conservación de los datos: Los datos personales serán conservados durante el tiempo necesario para cumplir con los fines para los que fueron recabados y mientras se mantenga la relación contractual entre las partes. Una vez finalizado el contrato, los datos serán eliminados, salvo obligación legal de conservación.' },
  { type: 'p', text: 'e. Cesión de datos: PROJECT ROBIN STUDENTS MOBILITY S.L. no compartirá los datos personales del Cliente con terceros, salvo que sea necesario para la ejecución del servicio o por obligación legal.' },
  { type: 'p', text: 'f. Consentimiento: La firma de este contrato implica el consentimiento expreso del Cliente para el tratamiento de sus datos personales según las condiciones aquí establecidas.' },
];

const PRIVACIDAD_RESUMIDA = [
  { type: 'p', text: 'PROJECT ROBIN STUDENTS MOBILITY S.L. tratará los datos personales conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018.' },
  { type: 'ul', items: [
    'Finalidad: prestación del servicio.',
    'Confidencialidad: adopción de medidas de seguridad adecuadas.',
    'Derechos: acceso, rectificación, supresión, limitación, oposición y portabilidad.',
    `Contacto de privacidad: ${PRIVACY_EMAIL}.`,
    'Conservación: durante la relación contractual y el tiempo legalmente exigido.',
    'Cesión: solo cuando sea necesario para la ejecución del servicio o por obligación legal.',
  ] },
  { type: 'p', text: 'La firma implica consentimiento expreso.' },
];

const PAGOS_TRES_TERCIOS = [
  { type: 'p', text: 'El pago por los servicios se efectuará en tres cuotas, distribuidas de la siguiente manera:' },
  { type: 'ul', items: [
    'Un tercio (1/3) del total al inicio del servicio, tras la primera reunión y antes de la segunda, salvo que alguno de los asesores de Project Robin indique otra cosa.',
    'Un tercio (1/3) del total tras la presentación de las aplicaciones.',
    'Un tercio (1/3) del total tras la aceptación en al menos una universidad.',
  ] },
  { type: 'p', text: 'Dichos pagos están sujetos a los descuentos pertinentes de los que informará un asesor de Project Robin, así como a reducciones en el precio sujetas a servicios u otros bienes de consumo acordados previamente bajo otro contrato específico aplicable a la situación.' },
];

const SERVICIOS_TRANSICION = [
  { type: 'h3', text: '1.1 Soporte y acompañamiento antes y durante la llegada' },
  { type: 'ul', items: [
    'Guía práctica previa al viaje (transporte, trámites iniciales y consejos locales).',
    'Seguimiento y soporte durante la llegada a Países Bajos.',
    'Asistencia personalizada en las primeras semanas de instalación, incluyendo asesoramiento para conseguir ayudas ligadas al trabajo y trámites como el número BSN o el DigiD.',
  ] },
  { type: 'p', text: 'Los siguientes servicios están incluidos en el servicio contratado hasta el 14 de septiembre de 2027. A partir del 15 de septiembre de 2027, su continuidad estará sujeta a la contratación y mantenimiento activo de la suscripción ROBIN.' },
  { type: 'h3', text: '1.2 Atención continua' },
  { type: 'ul', items: ['Canal de comunicación directo con el equipo de PROJECT ROBIN STUDENTS MOBILITY S.L. para resolver incidencias o dudas.', 'Soporte activo durante el periodo inicial de adaptación.'] },
  { type: 'h3', text: '1.3 Charlas y sesiones con expertos' },
  { type: 'ul', items: ['Acceso a sesiones y charlas con perfiles relevantes (estudiantes, profesionales y alumni) que aporten contexto real sobre la experiencia universitaria y profesional.', 'Contenido orientado a facilitar la adaptación académica, social y personal del alumno.'] },
  { type: 'h3', text: '1.4 Acceso a la Comunidad Robin' },
  { type: 'ul', items: ['Integración en la Comunidad Robin, incluyendo grupos y canales de comunicación con otros estudiantes.', 'Contacto directo con alumnos que comienzan su experiencia en Países Bajos durante el curso académico 2026-2027.', 'Fomento del apoyo mutuo, integración social y networking.'] },
  { type: 'h3', text: '1.5 Recomendaciones de asociaciones y eventos' },
  { type: 'ul', items: ['Información sobre asociaciones estudiantiles y actividades locales relevantes.', 'Sugerencias de eventos previos e inmediatamente posteriores al inicio de clases.'] },
];

const SERVICE_OBLIGATIONS = [
  { type: 'h3', text: 'Obligaciones del Cliente' },
  { type: 'ul', items: ['Proporcionar información veraz y completa.', 'Cumplir con los plazos establecidos.', 'Colaborar activamente durante el proceso.'] },
  { type: 'p', text: 'El incumplimiento de estas obligaciones limitará la responsabilidad de PROJECT ROBIN STUDENTS MOBILITY S.L. únicamente respecto de los retrasos, errores o resultados adversos que deriven directa y exclusivamente de dicha falta de colaboración. Esta previsión no excluirá la responsabilidad de la Empresa por sus propios errores, omisiones o retrasos.' },
  { type: 'h3', text: 'Compromisos de Project Robin' },
  { type: 'p', text: 'PROJECT ROBIN STUDENTS MOBILITY S.L. se compromete a actuar de buena fe y con diligencia profesional. Cuando el servicio contratado incluya la carga, presentación o envío de documentos, solicitudes o formularios, la Empresa será responsable de realizarlos dentro de los plazos oficiales aplicables y de introducir, transcribir y remitir correctamente la información facilitada por El Cliente, siempre que este la haya entregado de forma completa, veraz y con antelación suficiente.' },
  { type: 'p', text: 'La Empresa no garantiza resultados que dependan de universidades, organismos públicos, residencias o proveedores externos, pero sí responderá de las actuaciones que le sean directamente imputables conforme a lo previsto en este contrato.' },
];

const GENERAL = {
  key: 'general',
  title: 'Contrato de Términos y Condiciones de los Servicios de Consultoría Académica y Mentoría',
  acceptanceFooter: 'EL PAGO DE LA PRIMERA CUOTA POR PARTE DE EL CLIENTE IMPLICARÁ LA ACEPTACIÓN PLENA Y SIN RESERVAS DE LOS PRESENTES TÉRMINOS Y CONDICIONES, ASÍ COMO DE TODAS LAS OBLIGACIONES Y DERECHOS AQUÍ ESTABLECIDOS.',
  blocks: [
    { type: 'h2', text: 'Entre' }, INTRO_ADMISSIONS, ...DATOS_PARTES,
    { type: 'h2', text: '1. Objeto del contrato' },
    { type: 'p', text: 'La Empresa se compromete a proporcionar servicios de asesoría y mentoría académica para la preparación y gestión del proceso de admisión en uno (1), dos (2) o tres (3) grados en los Países Bajos, cuyo número y programas concretos se determinarán posteriormente de acuerdo con El Cliente. El objetivo de los servicios es guiar a El Cliente en el proceso de selección de universidades, la preparación de documentos de solicitud y la presentación de las aplicaciones, según lo acordado con El Cliente.' },
    { type: 'p', text: 'Adicionalmente, La Empresa ofrece los siguientes servicios complementarios incluidos en el precio:' },
    ...ALOJAMIENTO_PARTNER,
    { type: 'ul', items: [
      'Resolución de dudas: Disponibilidad para responder preguntas sobre el proceso de admisión, estudios y la vida en los Países Bajos.',
      'Conexión con otros estudiantes: Posibilidad de poner en contacto a El Cliente con otros estudiantes que están en el mismo proceso.',
      'Acceso a nuestra red de expertos: Orientación a través de nuestra red de contactos y mentores actualmente viviendo y estudiando en los Países Bajos.',
      'Esto incluye una llamada por universidad seleccionada, lo cual varía dependiendo del número de aplicaciones seleccionado.',
    ] },
    { type: 'h2', text: '2. Servicios ofrecidos y tarifas' },
    { type: 'p', text: 'Las siguientes opciones se incluyen a título informativo. El número y los grados concretos se determinarán posteriormente con El Cliente y no constituyen campos rellenables de este contrato:' },
    { type: 'ul', items: ['Aplicación a 1 grado: 1.700 €', 'Aplicación a 2 grados: 2.000 €', 'Aplicación a 3 grados: 2.100 €'] },
    ...PAGOS_TRES_TERCIOS,
    { type: 'h2', text: '3. Forma de pago' }, ...FORMA_PAGO_ADMISSIONS,
    { type: 'h2', text: '4. Limitación de responsabilidad y compromisos de Project Robin' }, ...RESPONSABILIDAD_ADMISSIONS,
    { type: 'h2', text: '5. Derecho de admisión' }, ...DERECHO_ADMISION_ADMISSIONS,
    { type: 'h2', text: '6. Obligaciones del Cliente' }, ...OBLIGACIONES_ADMISSIONS,
    { type: 'h2', text: '7. Duración del contrato' }, ...DURACION,
    { type: 'h2', text: '8. Jurisdicción y ley aplicable' }, ...JURISDICCION_ADMISSIONS,
    { type: 'h2', text: '9. Protección de Datos Personales' }, ...PRIVACIDAD_DETALLADA,
  ],
};

const GENERAL_NOES = {
  key: 'general_noes',
  title: 'Contrato de Términos y Condiciones de los Servicios de Consultoría Académica y Mentoría · Modalidad para alumnado sin documento de identidad europeo',
  acceptanceFooter: GENERAL.acceptanceFooter,
  blocks: [
    { type: 'h2', text: 'Entre' }, INTRO_ADMISSIONS, ...DATOS_PARTES,
    { type: 'h2', text: '1. Objeto del contrato' },
    { type: 'p', text: 'La Empresa se compromete a proporcionar servicios de asesoría y mentoría académica para la preparación y gestión del proceso de admisión en hasta tres (3) grados o postgrados en los Países Bajos, cuyos programas concretos se determinarán posteriormente de acuerdo con El Cliente. El objetivo de los servicios es guiar a El Cliente en el proceso de selección de universidades, la preparación de documentos de solicitud y la presentación de las aplicaciones, según lo acordado con El Cliente.' },
    { type: 'p', text: 'Adicionalmente, La Empresa ofrece los siguientes servicios complementarios incluidos en el precio:' },
    ...ALOJAMIENTO_PARTNER,
    { type: 'ul', items: [
      'Resolución de dudas: Disponibilidad para responder preguntas sobre el proceso de admisión, estudios y la vida en los Países Bajos.',
      'Conexión con otros estudiantes: Posibilidad de poner en contacto a El Cliente con otros estudiantes que están en el mismo proceso.',
      'Acceso a nuestra red de expertos: Orientación a través de nuestra red de contactos y mentores actualmente viviendo y estudiando en los Países Bajos.',
      'Gestión del proceso de visado: Gestión del proceso de visado desde el país de origen hasta el país de destino cuando el alumno no disponga de un documento de identidad europeo.',
      'Esto incluye una llamada por universidad seleccionada, lo cual varía dependiendo del número de aplicaciones seleccionado.',
    ] },
    { type: 'h2', text: '2. Servicios ofrecidos y tarifas' },
    { type: 'p', text: 'La tarifa comprende la aplicación a hasta tres (3) grados o postgrados y todos los servicios indicados, por un coste total de 2.700 €. Los programas concretos se determinarán posteriormente y no constituyen campos rellenables de este contrato.' },
    ...PAGOS_TRES_TERCIOS,
    { type: 'h2', text: '3. Forma de pago' }, ...FORMA_PAGO_ADMISSIONS,
    { type: 'h2', text: '4. Limitación de responsabilidad y compromisos de Project Robin' }, ...RESPONSABILIDAD_ADMISSIONS,
    { type: 'h2', text: '5. Derecho de admisión' }, ...DERECHO_ADMISION_ADMISSIONS,
    { type: 'h2', text: '6. Obligaciones del Cliente' }, ...OBLIGACIONES_ADMISSIONS,
    { type: 'h2', text: '7. Duración del contrato' }, ...DURACION,
    { type: 'h2', text: '8. Jurisdicción y ley aplicable' }, ...JURISDICCION_ADMISSIONS,
    { type: 'h2', text: '9. Protección de Datos Personales' }, ...PRIVACIDAD_DETALLADA,
  ],
};

const DELFT = {
  key: 'delft',
  title: 'Contrato de Términos y Condiciones de los Servicios de Formación, Consultoría Académica y Mentoría',
  acceptanceFooter: GENERAL.acceptanceFooter,
  blocks: [
    { type: 'h2', text: 'Entre' },
    { type: 'p', text: 'PROJECT ROBIN STUDENTS MOBILITY S.L., con domicilio en Calle Covarrubias 9, 28010 Madrid, Comunidad de Madrid, España, NIF B75355057, en adelante PROJECT ROBIN STUDENTS MOBILITY S.L., y la persona cuyos datos se consignan a continuación, en adelante El Cliente, acuerdan las siguientes condiciones en relación con la prestación de servicios de formación, consultoría académica y mentoría para la aplicación a universidades en los Países Bajos.' },
    ...DATOS_PARTES,
    { type: 'h2', text: '1. Objeto del contrato' },
    { type: 'p', text: 'La Empresa se compromete a proporcionar servicios de asesoría, mentoría y formación académica para la preparación y gestión del proceso de admisión en tres (3) grados en los Países Bajos, más la aplicación y la formación específica para el grado de Ingeniería Aeroespacial en Delft. El objetivo de los servicios es guiar a El Cliente en el proceso de selección de universidades, la preparación de documentos de solicitud y la presentación de las aplicaciones, según lo acordado con El Cliente.' },
    { type: 'p', text: 'Adicionalmente, La Empresa ofrece los siguientes servicios complementarios incluidos en el precio:' },
    ...ALOJAMIENTO_PARTNER,
    { type: 'ul', items: [
      'Resolución de dudas: Disponibilidad para responder preguntas sobre el proceso de admisión, estudios y la vida en los Países Bajos.',
      'Conexión con otros estudiantes: Posibilidad de poner en contacto a El Cliente con otros estudiantes que están en el mismo proceso.',
      'Acceso a nuestra red de expertos: Orientación a través de nuestra red de contactos y mentores actualmente viviendo y estudiando en los Países Bajos.',
      'Esto incluye una llamada por universidad seleccionada, lo cual varía dependiendo del número de aplicaciones seleccionado.',
      'Adicionalmente, se añade el curso integral de preparación para la admisión en Delft, de acuerdo con el programa estipulado y entregado al cliente, comprendido entre los dos primeros pagos, siendo este componente educativo la parte principal de dichos pagos.',
    ] },
    { type: 'h2', text: '2. Servicios ofrecidos y tarifas' },
    { type: 'p', text: 'El paquete contratado comprende:' },
    { type: 'ul', items: ['Aplicación a 3 grados + aplicación y preparación específica para el grado de Ingeniería Aeroespacial en Delft: 2.999 € (IVA incluido).'] },
    { type: 'p', text: 'El pago por los servicios se efectuará en tres cuotas, distribuidas de la siguiente manera:' },
    { type: 'ul', items: [
      '999 € al inicio del servicio, tras la primera reunión y antes de la segunda, salvo que alguno de los asesores de Robin indique otra cosa.',
      '1.000 € tras la presentación de las aplicaciones.',
      '1.000 € tras la aceptación en al menos una universidad.',
    ] },
    { type: 'p', text: 'Dichos pagos están sujetos a los descuentos pertinentes de los que informará un asesor de Project Robin, así como a reducciones en el precio sujetas a servicios u otros bienes de consumo acordados previamente bajo otro contrato específico aplicable a la situación.' },
    { type: 'h2', text: '3. Forma de pago' }, ...FORMA_PAGO_ADMISSIONS,
    { type: 'h2', text: '4. Limitación de responsabilidad y compromisos de Project Robin' }, ...RESPONSABILIDAD_ADMISSIONS,
    { type: 'h2', text: '5. Derecho de admisión' }, ...DERECHO_ADMISION_ADMISSIONS,
    { type: 'h2', text: '6. Obligaciones del Cliente' }, ...OBLIGACIONES_ADMISSIONS,
    { type: 'h2', text: '7. Duración del contrato' }, ...DURACION,
    { type: 'h2', text: '8. Jurisdicción y ley aplicable' }, ...JURISDICCION_ADMISSIONS,
    { type: 'h2', text: '9. Protección de Datos Personales' }, ...PRIVACIDAD_DETALLADA,
  ],
};

function transitionContract({ key, title, programName, priceBlocks, housingExtra, cancellationBlocks, finalBlocks = [] }) {
  return {
    key,
    title,
    acceptanceFooter: key === 'mentoria'
      ? 'EL PAGO DE LA PRIMERA CUOTA POR PARTE DE EL CLIENTE IMPLICARÁ LA ACEPTACIÓN PLENA Y SIN RESERVAS DE LOS PRESENTES TÉRMINOS Y CONDICIONES.'
      : GENERAL.acceptanceFooter,
    blocks: [
      { type: 'h2', text: 'Entre' }, INTRO_TRANSITION, ...DATOS_PARTES,
      { type: 'h2', text: '1. Objeto del contrato' },
      { type: 'p', text: `PROJECT ROBIN STUDENTS MOBILITY S.L. prestará a El Cliente los servicios de acompañamiento, orientación y mentoría durante el proceso de transición a la vida universitaria en Países Bajos, correspondientes al programa ${programName}, que incluye los servicios detallados a continuación:` },
      ...SERVICIOS_TRANSICION,
      { type: 'h3', text: '1.6 Alojamiento garantizado en residencia partner' },
      ...ALOJAMIENTO_PARTNER.slice(1),
      ...(housingExtra ? [{ type: 'p', text: housingExtra }] : []),
      { type: 'h2', text: '2. Duración del servicio' }, ...DURACION,
      { type: 'h2', text: '3. Precio y forma de pago' }, ...priceBlocks,
      { type: 'h2', text: '4. Forma de pago' }, ...FORMA_PAGO_SERVICE,
      { type: 'h2', text: '5. Cancelaciones y reembolsos' }, ...cancellationBlocks,
      { type: 'h2', text: '6. Derecho de admisión' },
      { type: 'p', text: key === 'mentoria'
        ? 'PROJECT ROBIN STUDENTS MOBILITY S.L. se reserva el derecho de admisión a sus servicios, evaluando el perfil del alumno en función de su compromiso, actitud y viabilidad del proceso.'
        : 'PROJECT ROBIN STUDENTS MOBILITY S.L. se reserva el derecho de admisión a sus servicios de consultoría y mentoría académica. La Empresa evaluará las características de cada alumno considerando su historial académico, compromiso y viabilidad del proceso. En caso de no considerar adecuado el perfil, podrá rechazar la prestación del servicio.' },
      { type: 'h2', text: '7. Obligaciones del Cliente y compromisos de Project Robin' }, ...SERVICE_OBLIGATIONS,
      { type: 'h2', text: '8. Jurisdicción y ley aplicable' },
      { type: 'p', text: key === 'mentoria'
        ? 'El presente contrato se regirá por las leyes de España. Cualquier controversia se someterá a los tribunales de Madrid.'
        : 'El presente contrato se regirá por las leyes de España. Cualquier controversia se someterá a la jurisdicción de los tribunales competentes de Madrid, Comunidad de Madrid.' },
      { type: 'h2', text: '9. Protección de Datos Personales' }, ...PRIVACIDAD_RESUMIDA,
      { type: 'h2', text: '10. Aceptación' },
      { type: 'p', text: key === 'mentoria'
        ? 'El pago de la primera cuota implica la aceptación plena de los presentes términos.'
        : 'El pago de la primera cuota por parte de El Cliente implicará la aceptación plena y sin reservas de los presentes términos y condiciones.' },
      ...finalBlocks,
    ],
  };
}

const LLEGADA = transitionContract({
  key: 'llegada',
  title: 'Contrato de Términos y Condiciones · Servicios de consultoría académica y mentoría - Pack Llegada Robin',
  programName: 'Pack Llegada Robin',
  housingExtra: 'Si El Cliente opta por alojamiento en piso privado fuera de las residencias partner, será necesario contratar el extra correspondiente de Housing en Piso, conforme a lo indicado en la propuesta económica vigente.',
  priceBlocks: [
    { type: 'p', text: 'El precio del Pack Llegada Robin es de 1.700 € (IVA incluido).' },
    { type: 'p', text: 'El Cliente podrá contratar, de forma opcional, los siguientes servicios adicionales:' },
    { type: 'ul', items: ['Extra Revisión de candidaturas: 150 € (IVA incluido).', 'Extra Housing en Piso: 450 € (IVA incluido).'] },
    { type: 'p', text: 'Estos servicios adicionales deberán ser expresamente aceptados por El Cliente.' },
    { type: 'h3', text: 'División de pagos' },
    { type: 'p', text: 'El pago del Pack Llegada se realizará en dos fases:' },
    { type: 'ul', items: ['Primer pago: 850 €, en el momento del primer contacto y aceptación del servicio.', 'Segundo pago: importe restante, dependiendo de si se contrata algún extra en el momento de la firma o confirmación del contrato de alojamiento.'] },
    { type: 'p', text: 'El inicio de la prestación de los servicios quedará condicionado a la recepción del primer pago.' },
  ],
  cancellationBlocks: [{ type: 'ul', items: [
    'Si El Cliente cancela el servicio antes de la primera llamada, se reembolsará el 70 % del importe abonado.',
    'Si el proceso de alojamiento ya ha comenzado, no se realizará reembolso del primer pago. El proceso se considera iniciado una vez realizada la primera reunión con El Cliente.',
    'Si El Cliente no llega finalmente a Países Bajos por motivos personales, el servicio se considerará prestado en la parte correspondiente a la preparación y asesoramiento, debiéndose abonar el importe íntegro de los servicios.',
  ] }],
});

const MENTORIA = transitionContract({
  key: 'mentoria',
  title: 'Contrato de Términos y Condiciones · Servicios de consultoría académica y mentoría',
  programName: 'Mentoría Robin',
  priceBlocks: [
    { type: 'p', text: 'El precio de la mentoría es de 800 € (IVA incluido).' },
    { type: 'p', text: 'El Cliente podrá contratar, de forma opcional, los siguientes servicios adicionales:' },
    { type: 'ul', items: ['Extra Revisión de candidaturas: 150 € (IVA incluido).'] },
    { type: 'p', text: 'Estos servicios adicionales deberán ser expresamente aceptados por El Cliente.' },
    { type: 'h3', text: 'División de pagos' },
    { type: 'p', text: 'El pago de la mentoría se realizará en dos fases:' },
    { type: 'ul', items: ['Primer pago: 400 € + extras contratados, en el momento del primer contacto y aceptación del servicio.', 'Segundo pago: 400 €.'] },
    { type: 'p', text: 'El inicio de la prestación de los servicios quedará condicionado a la recepción del primer pago.' },
  ],
  cancellationBlocks: [{ type: 'ul', items: [
    'Si El Cliente cancela el servicio antes de iniciarse la primera reunión, se reembolsará el 70 % del importe abonado.',
    'Si el servicio ya ha comenzado, entendiéndose como tal la primera reunión o interacción efectiva, no se realizará reembolso del primer pago.',
    'Si el alumno no inicia finalmente su experiencia en Países Bajos por motivos personales, el servicio se considerará prestado en la parte correspondiente al acompañamiento y asesoramiento, debiéndose abonar el importe íntegro.',
  ] }],
  finalBlocks: [
    { type: 'h2', text: '11. Acompañamiento durante el primer año' },
    { type: 'p', text: 'PROJECT ROBIN STUDENTS MOBILITY S.L. ofrecerá acompañamiento en Países Bajos, en aspectos de adaptación, orientación práctica y resolución de dudas, hasta el 14 de septiembre de 2027. A partir del 15 de septiembre de 2027, la continuidad de este acompañamiento quedará integrada en el programa de suscripción ROBIN y requerirá una suscripción activa.' },
    { type: 'p', text: 'Este servicio no incluye asesoramiento legal, médico o psicológico profesional.' },
    { type: 'h2', text: '12. Comunidad Robin' },
    { type: 'p', text: 'El Cliente y el alumno tendrán acceso a la Comunidad Robin, con el objetivo de facilitar la integración, el networking y el intercambio de información entre estudiantes, hasta el 14 de septiembre de 2027. A partir del 15 de septiembre de 2027, este acceso estará sujeto a la suscripción ROBIN.' },
  ],
});

const VARIANTS = { general: GENERAL, general_noes: GENERAL_NOES, delft: DELFT, llegada: LLEGADA, mentoria: MENTORIA };

function variantKey(tipo, esOtros) {
  const t = String(tipo || 'general').toLowerCase();
  if (t === 'general' && esOtros) return 'general_noes';
  if (VARIANTS[t]) return t;
  return 'general';
}

function fill(text, values) {
  return String(text || '').replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}

module.exports = { PRIVACY_EMAIL, VARIANTS, variantKey, fill };
