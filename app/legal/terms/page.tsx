export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Alpha Marino</p>
          <h1 className="text-2xl font-bold">Condiciones del Servicio</h1>
          <p className="text-sm text-muted-foreground mt-1">Última actualización: abril 2025</p>
        </div>

        <Section title="1. Descripción del servicio">
          El Dashboard de Alpha Marino es una herramienta interna de gestión de campañas y proyectos. El acceso está restringido a personal autorizado de Alpha Marino y colaboradores designados.
        </Section>

        <Section title="2. Uso aceptable">
          Los usuarios autorizados se comprometen a:
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Usar la plataforma exclusivamente para fines profesionales relacionados con Alpha Marino</li>
            <li>No compartir credenciales de acceso con terceros no autorizados</li>
            <li>Mantener la confidencialidad de los datos de clientes</li>
            <li>Respetar las políticas de uso de las plataformas publicitarias conectadas</li>
          </ul>
        </Section>

        <Section title="3. Acceso a plataformas de terceros">
          Esta aplicación se conecta a la API de Meta mediante permisos otorgados explícitamente. El uso de datos obtenidos a través de esta integración está sujeto a las políticas de uso de datos de Meta.
        </Section>

        <Section title="4. Limitación de responsabilidad">
          Alpha Marino no se hace responsable de interrupciones en el servicio causadas por terceros (Meta, proveedores de infraestructura, etc.) ni por decisiones de negocio tomadas en base a los datos mostrados en el dashboard.
        </Section>

        <Section title="5. Modificaciones">
          Alpha Marino se reserva el derecho de modificar estas condiciones en cualquier momento. Los cambios serán notificados a los usuarios activos.
        </Section>

        <Section title="6. Contacto">
          Para consultas sobre estas condiciones:
          <br />
          <a href="mailto:remioi622@gmail.com" className="text-blue-600 underline mt-1 inline-block">
            remioi622@gmail.com
          </a>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-gray-700 leading-relaxed">{children}</p>
    </div>
  )
}
