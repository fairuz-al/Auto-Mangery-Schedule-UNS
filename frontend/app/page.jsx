'use client';

import { useState } from 'react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { processKrsAndGetSchedule } from './Action/GetAutoJadwal';

export default function AutoSchedulerPage() {
  const [loading, setLoading] = useState(false);
  const [jadwal, setJadwal] = useState([]);
  const [fileName, setFileName] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.target);
    const res = await processKrsAndGetSchedule(formData);

    if (res.success) {
      setJadwal(res.data.jadwal);
    } else {
      alert('Gagal memproses: ' + res.error);
    }

    setLoading(false);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFileName(e.target.files[0].name);
    }
  };

  const handleDownloadPdf = async () => {
    const element = document.getElementById('jadwal-table');
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#171717',
        useCORS: true,
        logging: false,
        ignoreElements: (el) => el.dataset && el.dataset.pdfIgnore === 'true',
      });

      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      const printWidth = pageWidth - margin * 2;
      let imgHeight = (canvas.height * printWidth) / canvas.width;

      const maxHeight = pageHeight - margin * 2;
      let finalWidth = printWidth;
      let finalHeight = imgHeight;

      if (imgHeight > maxHeight) {
        finalHeight = maxHeight;
        finalWidth = (canvas.width * finalHeight) / canvas.height;
      }

      const x = (pageWidth - finalWidth) / 2;
      const y = margin;

      pdf.setFillColor(15, 15, 15)
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');

      pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
      pdf.save(`Jadwal-Kuliah-UNS-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Gagal mengunduh PDF: ' + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-12 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-3">
          <div className="inline-block px-3 py-1 bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold rounded-full uppercase tracking-wider">
            UNS Informatika Schedule Generator
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
            Auto-Manager Schedule UNS
          </h1>
          <p className="text-neutral-400 text-sm md:text-base max-w-xl mx-auto">
            Upload PDF KRS Anda dan dapatkan rincian Hari, Sesi Jam, serta Ruang Kuliah dari SIAKAD UNS secara otomatis.
          </p>
        </div>

        {/* Upload Form Box */}
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 md:p-8 backdrop-blur-sm shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="border-2 border-dashed border-neutral-700 hover:border-sky-500/50 transition-colors rounded-xl p-8 text-center relative group bg-neutral-950/40">
              <input
                type="file"
                name="pdfFile"
                accept=".pdf"
                required
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 group-hover:text-sky-400 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="text-sm font-medium">
                  {fileName ? (
                    <span className="text-sky-400 font-semibold">{fileName}</span>
                  ) : (
                    <span>Klik atau tarik file <strong className="text-white">KRS (PDF)</strong> ke sini</span>
                  )}
                </div>
                <p className="text-xs text-neutral-500">Format yang didukung: .pdf</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold py-3 px-6 rounded-xl transition shadow-lg shadow-sky-500/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Mengekstrak KRS & Scrape SIAKAD...</span>
                </>
              ) : (
                <span>Proses Jadwal Otomatis</span>
              )}
            </button>
          </form>
        </div>

        {/* Schedule Table Result */}
        {jadwal.length > 0 && (
          <div id="jadwal-table" className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-bold text-white">Hasil Jadwal Kuliah</h2>
                <span className="text-xs bg-neutral-800 text-neutral-300 px-3 py-1 rounded-full font-mono">
                  Total {jadwal.length} Mata Kuliah
                </span>
              </div>
              <button
                onClick={handleDownloadPdf}
                data-pdf-ignore="true"
                className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-semibold py-2.5 px-5 rounded-xl transition shadow-lg shadow-emerald-500/10 flex items-center space-x-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download PDF</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-neutral-800">
              <table className="w-full text-sm text-left text-neutral-300">
                <thead className="text-xs uppercase bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                  <tr>
                    <th className="px-4 py-3">Kode</th>
                    <th className="px-4 py-3">Mata Kuliah</th>
                    <th className="px-4 py-3 text-center">Kelas</th>
                    <th className="px-4 py-3 text-center">Hari</th>
                    <th className="px-4 py-3 text-center">Jam</th>
                    <th className="px-4 py-3">Ruang</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {jadwal.map((item, idx) => (
                    <tr key={idx} className="hover:bg-neutral-800/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-neutral-400">{item.kodeMk}</td>
                      <td className="px-4 py-3 font-medium text-white">{item.namaMk}</td>
                      <td className="px-4 py-3 text-center font-bold text-sky-400">{item.kelas}</td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-400">
                        {item.hari}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-amber-300">
                        {item.jam}
                      </td>
                      <td className="px-4 py-3 text-neutral-200">{item.ruang}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
