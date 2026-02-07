// Servicio para integrar feriados de Ecuador
// Utiliza la API pública de feriados

interface Holiday {
  date: string;
  name: string;
  type: string;
}

export const ecuadorHolidaysService = {
  /**
   * Obtiene los feriados de Ecuador para un año específico
   * Utiliza API pública de feriados ecuatorianos
   */
  async getHolidaysForYear(year: number): Promise<Holiday[]> {
    try {
      // API pública de feriados de Ecuador
      // https://www.feriados.com.ec/ o similar
      // Para este ejemplo, usaremos una API pública conocida
      const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/EC`);
      
      if (!response.ok) {
        throw new Error('No se pudieron obtener los feriados');
      }
      
      const data = await response.json();
      
      return data.map((holiday: any) => ({
        date: holiday.date,
        name: holiday.name,
        type: 'feriado',
      }));
    } catch (error) {
      console.error('Error al obtener feriados de Ecuador:', error);
      return getDefaultEcuadorHolidays(year);
    }
  },

  /**
   * Obtiene los feriados de Ecuador para un rango de fechas
   */
  async getHolidaysForRange(startDate: Date, endDate: Date): Promise<Holiday[]> {
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
    
    const allHolidays: Holiday[] = [];
    
    for (const year of years) {
      const holidays = await this.getHolidaysForYear(year);
      allHolidays.push(...holidays);
    }
    
    // Filtrar por rango de fechas
    return allHolidays.filter(holiday => {
      const holidayDate = new Date(holiday.date);
      return holidayDate >= startDate && holidayDate <= endDate;
    });
  }
};

/**
 * Feriados fijos de Ecuador (como fallback)
 */
function getDefaultEcuadorHolidays(year: number): Holiday[] {
  return [
    { date: `${year}-01-01`, name: 'Año Nuevo', type: 'feriado' },
    { date: `${year}-02-12`, name: 'Carnaval', type: 'feriado' },
    { date: `${year}-03-08`, name: 'Viernes Santo', type: 'feriado' },
    { date: `${year}-05-01`, name: 'Día del Trabajo', type: 'feriado' },
    { date: `${year}-07-24`, name: 'Natalicio de Simón Bolívar', type: 'feriado' },
    { date: `${year}-08-10`, name: 'Independencia de Guayaquil', type: 'feriado' },
    { date: `${year}-10-09`, name: 'Independencia de Guayaquil', type: 'feriado' },
    { date: `${year}-11-01`, name: 'Día de Difuntos', type: 'feriado' },
    { date: `${year}-11-11`, name: 'Independencia de Latacunga', type: 'feriado' },
    { date: `${year}-12-06`, name: 'Fundación de Quito', type: 'feriado' },
    { date: `${year}-12-25`, name: 'Navidad', type: 'feriado' },
  ];
}
