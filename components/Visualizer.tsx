
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isActive }) => {
  const canvasRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!analyser || !isActive || !canvasRef.current) return;

    const svg = d3.select(canvasRef.current);
    const width = canvasRef.current.clientWidth;
    const height = canvasRef.current.clientHeight;
    const barPadding = 2;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const x = d3.scaleLinear()
      .domain([0, bufferLength])
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, 255])
      .range([height, 0]);

    const barWidth = (width / bufferLength) * 2.5;

    let animationFrameId: number;

    const renderFrame = () => {
      analyser.getByteFrequencyData(dataArray);

      svg.selectAll("rect")
        .data(Array.from(dataArray))
        .join("rect")
        .attr("x", (d, i) => i * (barWidth + barPadding))
        .attr("y", d => y(d))
        .attr("width", barWidth)
        .attr("height", d => height - y(d))
        .attr("fill", (d, i) => d3.interpolateCool(i / bufferLength))
        .attr("opacity", 0.8);

      animationFrameId = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      cancelAnimationFrame(animationFrameId);
      svg.selectAll("*").remove();
    };
  }, [analyser, isActive]);

  return (
    <div className="w-full h-64 relative glass-panel rounded-2xl overflow-hidden mt-6">
      <svg ref={canvasRef} className="w-full h-full" />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 font-medium italic">
          Broadcast inactive
        </div>
      )}
      <div className="absolute bottom-4 right-4 text-xs font-mono uppercase tracking-widest text-blue-400 opacity-50">
        Spectrum Analysis
      </div>
    </div>
  );
};

export default Visualizer;
