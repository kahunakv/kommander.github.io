// Ejected from @docusaurus/theme-mermaid so each color mode gets its own
// themeVariables. The stock component shares one options object across modes.
import React, {useEffect, useMemo, useRef} from 'react';
import ErrorBoundary from '@docusaurus/ErrorBoundary';
import {
  ErrorBoundaryErrorMessageFallback,
  useColorMode,
} from '@docusaurus/theme-common';
import {
  MermaidContainerClassName,
  useMermaidConfig,
  useMermaidRenderResult,
} from '@docusaurus/theme-mermaid/client';
import styles from './styles.module.css';

const fontFamily = "'Inter', system-ui, sans-serif";

// Site teal palette, same as src/components/Diagrams, so both diagram kinds match.
const palettes = {
  light: {
    darkMode: false,
    fontFamily,
    background: '#ffffff',
    primaryColor: '#dff6ec',
    primaryTextColor: '#04241b',
    primaryBorderColor: '#00a873',
    secondaryColor: '#effbf6',
    tertiaryColor: '#effbf6',
    mainBkg: '#dff6ec',
    nodeBorder: '#00a873',
    textColor: '#04241b',
    titleColor: '#04241b',
    lineColor: '#008f63',
    clusterBkg: '#effbf6',
    clusterBorder: '#8fdcc0',
    edgeLabelBackground: '#ffffff',
    noteBkgColor: '#effbf6',
    noteBorderColor: '#8fdcc0',
    noteTextColor: '#04241b',
    actorBkg: '#dff6ec',
    actorBorder: '#00a873',
    actorTextColor: '#04241b',
    actorLineColor: '#8fdcc0',
    signalColor: '#008f63',
    signalTextColor: '#04241b',
    labelBoxBkgColor: '#effbf6',
    labelBoxBorderColor: '#8fdcc0',
    labelTextColor: '#04241b',
    loopTextColor: '#04241b',
    activationBkgColor: '#c9f1e2',
    activationBorderColor: '#008f63',
    stateBkg: '#dff6ec',
    stateBorder: '#00a873',
    compositeBackground: '#effbf6',
    compositeTitleBackground: '#dff6ec',
    altBackground: '#effbf6',
    transitionColor: '#008f63',
    transitionLabelColor: '#04241b',
    specialStateColor: '#008f63',
    innerEndBackground: '#008f63',
  },
  dark: {
    darkMode: true,
    fontFamily,
    background: '#1b1b1d',
    primaryColor: '#003a2a',
    primaryTextColor: '#effcf7',
    primaryBorderColor: '#00a873',
    secondaryColor: '#04241b',
    tertiaryColor: '#04241b',
    mainBkg: '#003a2a',
    nodeBorder: '#00a873',
    textColor: '#effcf7',
    titleColor: '#effcf7',
    lineColor: '#00d892',
    clusterBkg: '#04241b',
    clusterBorder: '#00523a',
    edgeLabelBackground: '#1b1b1d',
    noteBkgColor: '#04241b',
    noteBorderColor: '#00523a',
    noteTextColor: '#effcf7',
    actorBkg: '#003a2a',
    actorBorder: '#00a873',
    actorTextColor: '#effcf7',
    actorLineColor: '#00523a',
    signalColor: '#00d892',
    signalTextColor: '#effcf7',
    labelBoxBkgColor: '#04241b',
    labelBoxBorderColor: '#00523a',
    labelTextColor: '#effcf7',
    loopTextColor: '#effcf7',
    activationBkgColor: '#014230',
    activationBorderColor: '#00d892',
    stateBkg: '#003a2a',
    stateBorder: '#00a873',
    compositeBackground: '#04241b',
    compositeTitleBackground: '#003a2a',
    altBackground: '#04241b',
    transitionColor: '#00d892',
    transitionLabelColor: '#effcf7',
    specialStateColor: '#00d892',
    innerEndBackground: '#00d892',
  },
};

// Rounded corners for plain nodes and subgraphs.
const themeCSS = `
  .node rect, .node .label-container { rx: 8px; ry: 8px; }
  .cluster rect { rx: 12px; ry: 12px; }
  .cluster-label .nodeLabel { font-weight: 700; }
`;

function useKommanderMermaidConfig() {
  const {colorMode} = useColorMode();
  const config = useMermaidConfig();
  return useMemo(
    () => ({
      ...config,
      themeVariables: {...palettes[colorMode], ...config.themeVariables},
      themeCSS: `${themeCSS}${config.themeCSS ?? ''}`,
    }),
    [colorMode, config],
  );
}

function MermaidRenderResult({renderResult}) {
  const ref = useRef(null);
  useEffect(() => {
    const div = ref.current;
    renderResult.bindFunctions?.(div);
  }, [renderResult]);
  return (
    <div
      ref={ref}
      className={`${MermaidContainerClassName} ${styles.container}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{__html: renderResult.svg}}
    />
  );
}

function MermaidRenderer({value}) {
  const config = useKommanderMermaidConfig();
  const renderResult = useMermaidRenderResult({text: value, config});
  if (renderResult === null) {
    return null;
  }
  return <MermaidRenderResult renderResult={renderResult} />;
}

export default function Mermaid(props) {
  return (
    <ErrorBoundary
      fallback={(params) => <ErrorBoundaryErrorMessageFallback {...params} />}>
      <MermaidRenderer {...props} />
    </ErrorBoundary>
  );
}
