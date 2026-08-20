'use server';

import { extractText } from 'unpdf';
import * as cheerio from 'cheerio';

const SESI_MAP = {
  default: {
    1: { start: '07:30', end: '08:20' },
    2: { start: '08:25', end: '09:15' },
    3: { start: '09:20', end: '10:10' },
    4: { start: '10:15', end: '11:05' },
    5: { start: '11:10', end: '12:00' },
    6: { start: '13:00', end: '13:50' },
    7: { start: '13:55', end: '14:45' },
    8: { start: '15:30', end: '16:20' },
    9: { start: '16:25', end: '17:15' },
    10: { start: '18:00', end: '18:50' },
    11: { start: '18:55', end: '19:20' },
  },
  jumat: {
    1: { start: '07:30', end: '08:20' },
    2: { start: '08:25', end: '09:15' },
    3: { start: '09:20', end: '10:10' },
    4: { start: '10:15', end: '11:05' },
    5: { start: '13:00', end: '13:50' },
    6: { start: '13:55', end: '14:45' },
    7: { start: '15:30', end: '16:20' },
    8: { start: '16:25', end: '17:15' },
    9: { start: '18:00', end: '18:50' },
    10: { start: '18:55', end: '19:20' },
    11: { start: '19:25', end: '20:15' },
  }
};

function convertSesiToJam(hari, sesiStr) {
  if (!sesiStr || sesiStr === '-') return '-';
  const sesis = sesiStr.split('-').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  if (sesis.length === 0) return sesiStr;
  const minSesi = Math.min(...sesis);
  const maxSesi = Math.max(...sesis);
  const isJumat = (hari || '').toUpperCase().includes('JUM');
  const map = isJumat ? SESI_MAP.jumat : SESI_MAP.default;
  const start = map[minSesi]?.start;
  const end = map[maxSesi]?.end;
  if (start && end) return `${start} - ${end}`;
  return sesiStr;
}

function OrderHari(hari) {
  if (!hari) return 99;
  
  const h = hari.trim().toUpperCase();
  if (h.includes('SENIN')) return 1;
  if (h.includes('SELASA')) return 2;
  if (h.includes('RABU')) return 3;
  if (h.includes('KAMIS')) return 4;
  if (h.includes('JUM')) return 5;
  if (h.includes('SABTU')) return 6;
  if (h.includes('MINGGU')) return 7;

  return 99;
}

async function fetchWithRetry(url, retries = 3, delayMs = 300) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) return await res.text();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  return '';
}

export async function processKrsAndGetSchedule(formData) {
  try {
    const file = formData.get('pdfFile');
    if (!file) throw new Error('File PDF tidak ditemukan');

    const arrayBuffer = await file.arrayBuffer();
    const { text } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
    const fullText = Array.isArray(text) ? text.join('\n') : (text || '');
    const userCourses = [];
    const mkRegex = /^\d+\s+(\d+)\s+(.+?)\s+([A-Z0-9]+)\s+(\d+)\s+([\d\.]+)/gm;
    let match;

    while ((match = mkRegex.exec(fullText)) !== null) {
      userCourses.push({
        kodeMk: match[1],
        namaMk: match[2].trim(),
        kelas: match[3],
        sks: parseInt(match[4]),
      });
    }

    if (userCourses.length === 0) {
      const fallbackRegex = /(\d{10,})\s+(.+?)\s+([A-Z0-9]+)\s+(\d+)/gm;
      while ((match = fallbackRegex.exec(fullText)) !== null) {
        userCourses.push({
          kodeMk: match[1],
          namaMk: match[2].trim(),
          kelas: match[3],
          sks: parseInt(match[4]),
        });
      }
    }

    const allIndexItems = [];
    for (let page = 1; page <= 5; page++) {
      const url = `https://siakad.uns.ac.id/jadwal/jadwal/index?fakultas=L&jadwal%5BKODE_PRODI%5D=informatika&jadwal%5BTAHUN%5D=2026&jadwal%5BKODE_MK%5D=&jadwal%5BSMT%5D=A&page=${page}`;
      try {
        const html = await fetchWithRetry(url);
        if (!html) break;
        const $ = cheerio.load(html);
        const rows = $('table tbody tr');
        if (rows.length === 0) break;

        rows.each((_, el) => {
          const cols = $(el).find('td');
          const kodeMk = $(cols[1]).text().trim();
          const namaMk = $(cols[3]).text().trim();
          const detailHref = $(el).find('a[href*="/jadwal/jadwal/detail"]').attr('href');
          if (detailHref) {
            allIndexItems.push({ kodeMk, namaMk, url: 'https://siakad.uns.ac.id' + detailHref });
          }
        });
      } catch (e) {
        console.error(`Page ${page} failed:`, e.message);
      }
    }

    const targetUrls = [];
    for (const uCourse of userCourses) {
      const matchedItem = allIndexItems.find((item) => {
        const nameMatch = item.namaMk.toLowerCase().trim() === uCourse.namaMk.toLowerCase().trim() ||
                          item.namaMk.toLowerCase().includes(uCourse.namaMk.toLowerCase()) ||
                          uCourse.namaMk.toLowerCase().includes(item.namaMk.toLowerCase());
        const kodeMatch = item.kodeMk === uCourse.kodeMk;
        return nameMatch || kodeMatch;
      });

      if (matchedItem && !targetUrls.some((t) => t.url === matchedItem.url)) {
        targetUrls.push(matchedItem);
      }
    }

    const urlsToFetch = targetUrls.length > 0 ? targetUrls : allIndexItems;

    const masterJadwal = [];
    for (const item of urlsToFetch) {
      try {
        await new Promise((r) => setTimeout(r, 100));
        const htmlDet = await fetchWithRetry(item.url);
        if (!htmlDet) continue;
        const $d = cheerio.load(htmlDet);

        $d('table tbody tr').each((_, el) => {
          const cols = $d(el).find('td');
          if (cols.length >= 4) {
            const kelas = $d(cols[0]).text().trim();
            const hari = $d(cols[1]).text().trim();
            const sesi = $d(cols[2]).text().trim();
            const ruang = $d(cols[3]).text().trim();

            if (hari && hari !== '-' && kelas && !kelas.includes('2026') && !kelas.includes('INFORMATIKA')) {
              masterJadwal.push({
                kodeMk: item.kodeMk,
                namaMk: item.namaMk,
                kelas,
                hari,
                sesi,
                jam: convertSesiToJam(hari, sesi),
                ruang,
              });
            }
          }
        });
      } catch (e) {
        console.error(`Detail failed for ${item.namaMk}:`, e.message);
      }
    }

    const finalSchedule = userCourses.map((course) => {
      const matched = masterJadwal.find((m) => {
        const nameMatch = m.namaMk.toLowerCase().trim() === course.namaMk.toLowerCase().trim() ||
                          m.namaMk.toLowerCase().includes(course.namaMk.toLowerCase()) ||
                          course.namaMk.toLowerCase().includes(m.namaMk.toLowerCase());
        const kodeMatch = m.kodeMk === course.kodeMk;
        const kelasMatch = m.kelas.toUpperCase() === course.kelas.toUpperCase() ||
                           m.kelas.toUpperCase().startsWith(course.kelas.toUpperCase()) ||
                           course.kelas.toUpperCase().startsWith(m.kelas.toUpperCase());

        return (nameMatch || kodeMatch) && kelasMatch;
      });

      return {
        ...course,
        hari: matched ? matched.hari : 'Belum Terjadwal',
        jam: matched ? matched.jam : '-',
        ruang: matched ? matched.ruang : '-',
      };
    });

    finalSchedule.sort((a, b) => {
      const dayA = OrderHari(a.hari);
      const dayB = OrderHari(b.hari);
      if (dayA !== dayB) return dayA - dayB;
      return (a.jam || '').localeCompare(b.jam || '');
    });

    return {
      success: true,
      data: {
        totalMk: finalSchedule.length,
        jadwal: finalSchedule,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}