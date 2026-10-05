import React from 'react';

export const FormulasPage: React.FC = () => {
  return (
    <div className="flex flex-col bg-[#F3F4F6]">
      <div className="bg-white border-b border-gray-200 z-10 shrink-0">
        <div className="px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-gray-900 tracking-wide uppercase">Pricing Formulas</h1>
        </div>
      </div>

      <div className="p-6 bg-[#F3F4F6]">
        <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Intro */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-2">How Pricing Works at Geekeyy</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            The pricing structure ensures a fair mapping of raw material costs along with manufacturing overheads. 
            Below are the standard formulas used to determine pricing across vendors and customers.
          </p>
        </div>

        {/* Current Price Formula */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-blue-50 border-b border-blue-100 px-6 py-4">
            <h3 className="text-base font-bold text-blue-900">1. Current Price (Customer Side Cost)</h3>
            <p className="text-xs text-blue-700 mt-1">This is the final price presented to the customer.</p>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4 font-mono bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm overflow-x-auto whitespace-nowrap">
              <span className="font-bold text-gray-900">Current Price</span>
              <span className="text-gray-400">=</span>
              <span className="text-blue-600">(RM Weight × Rate/kg)</span>
              <span className="text-gray-400">+</span>
              <span className="text-purple-600">Machining Price</span>
              <span className="text-gray-400">+</span>
              <span className="text-green-600">Coating/Painting</span>
            </div>
            
            <ul className="space-y-3 text-sm text-gray-600 ml-2">
              <li><strong className="text-gray-900">RM Weight:</strong> The net weight of the raw material (Casting).</li>
              <li><strong className="text-gray-900">Rate/kg:</strong> The combined raw material rate (Base MMR + Consumables - Extra Factor).</li>
              <li><strong className="text-gray-900">Machining Price:</strong> Standard machining operation costs added on top of the raw casting.</li>
              <li><strong className="text-gray-900">Coating:</strong> Powder coating or painting surface treatments.</li>
            </ul>
          </div>
        </div>

        {/* Rate Per Kg Formula */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-red-50 border-b border-red-100 px-6 py-4">
            <h3 className="text-base font-bold text-red-900">2. Raw Material Rate (Rate/kg)</h3>
            <p className="text-xs text-red-700 mt-1">The base material rate updated dynamically during revisions.</p>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4 font-mono bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm overflow-x-auto whitespace-nowrap">
              <span className="font-bold text-gray-900">Rate/kg</span>
              <span className="text-gray-400">=</span>
              <span className="text-red-600">Base MMR</span>
              <span className="text-gray-400">+</span>
              <span className="text-orange-600">Consumables Rate</span>
              <span className="text-gray-400">+</span>
              <span className="text-teal-600">Extra Factor</span>
            </div>
            
            <ul className="space-y-3 text-sm text-gray-600 ml-2">
              <li><strong className="text-gray-900">Base MMR:</strong> Market Material Rate defined per grade (e.g. ₹87.70).</li>
              <li><strong className="text-gray-900">Consumables Rate:</strong> Additional per-kg cost for melting and consumables.</li>
              <li><strong className="text-gray-900">Extra Factor:</strong> Additional per-kg factors for yield penalties or special alloys.</li>
            </ul>
          </div>
        </div>

        {/* Pricing Impact Formula */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-4">
            <h3 className="text-base font-bold text-emerald-900">3. Price Impact (Delta)</h3>
            <p className="text-xs text-emerald-700 mt-1">Calculated during batch edits when MMR rates are revised.</p>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-3 mb-4 font-mono bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">New Price</span>
                <span className="text-gray-400">=</span>
                <span className="text-gray-700">Old Price</span>
                <span className="text-gray-400">+</span>
                <span className="text-emerald-600">(New RM Cost - Old RM Cost)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">Delta</span>
                <span className="text-gray-400">=</span>
                <span className="text-gray-700">New Price</span>
                <span className="text-gray-400">-</span>
                <span className="text-gray-700">Old Price</span>
              </div>
            </div>
            <p className="text-sm text-gray-500 italic mt-4">
              * Note: Geekeyy absorbs internal cost changes (machining, coating). 
              The customer side impact only reflects changes to the base Raw Material cost.
            </p>
          </div>
        </div>

      </div>
      </div>
    </div>
  );
};

export default FormulasPage;
