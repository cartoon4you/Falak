import React from 'react';

export default function Hero() {
  return (
    <section className="relative w-full min-h-[400px] flex items-center justify-center overflow-hidden bg-gray-900">
      {/* Background Placeholder */}
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1920&auto=format&fit=crop')] bg-cover bg-center">
        <div className="absolute inset-0 bg-black/70" /> {/* Subtle gradient overlay */}
      </div>

      <div className="relative z-10 px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-red-600 to-red-800 tracking-tight leading-tight">
          شاهد عالمك السينمائي <br /> على منصة فلك
        </h1>
      </div>
    </section>
  );
}
