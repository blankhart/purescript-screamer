-- | Legacy sinuous DOM module, a frozen copy of the stage 5 generated code. Removed in stage 8.
module Screamer.Core.Sinuous.DOM.Svg where

import Screamer.Core.Sinuous (Attribute, Element, attribute_, svgElement_)

a_ :: Array Attribute -> Array Element -> Element
a_ = svgElement_ "a"

animate_ :: Array Attribute -> Array Element -> Element
animate_ = svgElement_ "animate"

animateMotion_ :: Array Attribute -> Array Element -> Element
animateMotion_ = svgElement_ "animateMotion"

animateTransform_ :: Array Attribute -> Array Element -> Element
animateTransform_ = svgElement_ "animateTransform"

circle_ :: Array Attribute -> Array Element -> Element
circle_ = svgElement_ "circle"

defs_ :: Array Attribute -> Array Element -> Element
defs_ = svgElement_ "defs"

desc_ :: Array Attribute -> Array Element -> Element
desc_ = svgElement_ "desc"

discard_ :: Array Attribute -> Array Element -> Element
discard_ = svgElement_ "discard"

ellipse_ :: Array Attribute -> Array Element -> Element
ellipse_ = svgElement_ "ellipse"

feBlend_ :: Array Attribute -> Array Element -> Element
feBlend_ = svgElement_ "feBlend"

feColorMatrix_ :: Array Attribute -> Array Element -> Element
feColorMatrix_ = svgElement_ "feColorMatrix"

feComponentTransfer_ :: Array Attribute -> Array Element -> Element
feComponentTransfer_ = svgElement_ "feComponentTransfer"

feComposite_ :: Array Attribute -> Array Element -> Element
feComposite_ = svgElement_ "feComposite"

feConvolveMatrix_ :: Array Attribute -> Array Element -> Element
feConvolveMatrix_ = svgElement_ "feConvolveMatrix"

feDiffuseLighting_ :: Array Attribute -> Array Element -> Element
feDiffuseLighting_ = svgElement_ "feDiffuseLighting"

feDisplacementMap_ :: Array Attribute -> Array Element -> Element
feDisplacementMap_ = svgElement_ "feDisplacementMap"

feDistantLight_ :: Array Attribute -> Array Element -> Element
feDistantLight_ = svgElement_ "feDistantLight"

feDropShadow_ :: Array Attribute -> Array Element -> Element
feDropShadow_ = svgElement_ "feDropShadow"

feFlood_ :: Array Attribute -> Array Element -> Element
feFlood_ = svgElement_ "feFlood"

feFuncA_ :: Array Attribute -> Array Element -> Element
feFuncA_ = svgElement_ "feFuncA"

feFuncB_ :: Array Attribute -> Array Element -> Element
feFuncB_ = svgElement_ "feFuncB"

feFuncG_ :: Array Attribute -> Array Element -> Element
feFuncG_ = svgElement_ "feFuncG"

feFuncR_ :: Array Attribute -> Array Element -> Element
feFuncR_ = svgElement_ "feFuncR"

feGaussianBlur_ :: Array Attribute -> Array Element -> Element
feGaussianBlur_ = svgElement_ "feGaussianBlur"

feImage_ :: Array Attribute -> Array Element -> Element
feImage_ = svgElement_ "feImage"

feMerge_ :: Array Attribute -> Array Element -> Element
feMerge_ = svgElement_ "feMerge"

feMergeNode_ :: Array Attribute -> Array Element -> Element
feMergeNode_ = svgElement_ "feMergeNode"

feMorphology_ :: Array Attribute -> Array Element -> Element
feMorphology_ = svgElement_ "feMorphology"

feOffset_ :: Array Attribute -> Array Element -> Element
feOffset_ = svgElement_ "feOffset"

fePointLight_ :: Array Attribute -> Array Element -> Element
fePointLight_ = svgElement_ "fePointLight"

feSpecularLighting_ :: Array Attribute -> Array Element -> Element
feSpecularLighting_ = svgElement_ "feSpecularLighting"

feSpotLight_ :: Array Attribute -> Array Element -> Element
feSpotLight_ = svgElement_ "feSpotLight"

feTile_ :: Array Attribute -> Array Element -> Element
feTile_ = svgElement_ "feTile"

feTurbulence_ :: Array Attribute -> Array Element -> Element
feTurbulence_ = svgElement_ "feTurbulence"

foreignObject_ :: Array Attribute -> Array Element -> Element
foreignObject_ = svgElement_ "foreignObject"

g_ :: Array Attribute -> Array Element -> Element
g_ = svgElement_ "g"

hatch_ :: Array Attribute -> Array Element -> Element
hatch_ = svgElement_ "hatch"

hatchpath_ :: Array Attribute -> Array Element -> Element
hatchpath_ = svgElement_ "hatchpath"

image_ :: Array Attribute -> Array Element -> Element
image_ = svgElement_ "image"

line_ :: Array Attribute -> Array Element -> Element
line_ = svgElement_ "line"

linearGradient_ :: Array Attribute -> Array Element -> Element
linearGradient_ = svgElement_ "linearGradient"

marker_ :: Array Attribute -> Array Element -> Element
marker_ = svgElement_ "marker"

mesh_ :: Array Attribute -> Array Element -> Element
mesh_ = svgElement_ "mesh"

meshgradient_ :: Array Attribute -> Array Element -> Element
meshgradient_ = svgElement_ "meshgradient"

meshpatch_ :: Array Attribute -> Array Element -> Element
meshpatch_ = svgElement_ "meshpatch"

meshrow_ :: Array Attribute -> Array Element -> Element
meshrow_ = svgElement_ "meshrow"

metadata_ :: Array Attribute -> Array Element -> Element
metadata_ = svgElement_ "metadata"

mpath_ :: Array Attribute -> Array Element -> Element
mpath_ = svgElement_ "mpath"

path_ :: Array Attribute -> Array Element -> Element
path_ = svgElement_ "path"

pattern_ :: Array Attribute -> Array Element -> Element
pattern_ = svgElement_ "pattern"

polygon_ :: Array Attribute -> Array Element -> Element
polygon_ = svgElement_ "polygon"

polyline_ :: Array Attribute -> Array Element -> Element
polyline_ = svgElement_ "polyline"

radialGradient_ :: Array Attribute -> Array Element -> Element
radialGradient_ = svgElement_ "radialGradient"

rect_ :: Array Attribute -> Array Element -> Element
rect_ = svgElement_ "rect"

script_ :: Array Attribute -> Array Element -> Element
script_ = svgElement_ "script"

set_ :: Array Attribute -> Array Element -> Element
set_ = svgElement_ "set"

solidcolor_ :: Array Attribute -> Array Element -> Element
solidcolor_ = svgElement_ "solidcolor"

stop_ :: Array Attribute -> Array Element -> Element
stop_ = svgElement_ "stop"

svg_ :: Array Attribute -> Array Element -> Element
svg_ = svgElement_ "svg"

switch_ :: Array Attribute -> Array Element -> Element
switch_ = svgElement_ "switch"

symbol_ :: Array Attribute -> Array Element -> Element
symbol_ = svgElement_ "symbol"

text_ :: Array Attribute -> Array Element -> Element
text_ = svgElement_ "text"

textPath_ :: Array Attribute -> Array Element -> Element
textPath_ = svgElement_ "textPath"

title_ :: Array Attribute -> Array Element -> Element
title_ = svgElement_ "title"

tspan_ :: Array Attribute -> Array Element -> Element
tspan_ = svgElement_ "tspan"

unknown_ :: Array Attribute -> Array Element -> Element
unknown_ = svgElement_ "unknown"

use_ :: Array Attribute -> Array Element -> Element
use_ = svgElement_ "use"

view_ :: Array Attribute -> Array Element -> Element
view_ = svgElement_ "view"


externalResourcesRequired_ :: Boolean -> Attribute
externalResourcesRequired_ = attribute_ "externalResourcesRequired"

preserveAlpha_ :: Boolean -> Attribute
preserveAlpha_ = attribute_ "preserveAlpha"

numOctaves_ :: Int -> Attribute
numOctaves_ = attribute_ "numOctaves"

tabindex_ :: Int -> Attribute
tabindex_ = attribute_ "tabindex"

accentHeight_ :: Number -> Attribute
accentHeight_ = attribute_ "accent-height"

ascent_ :: Number -> Attribute
ascent_ = attribute_ "ascent"

azimuth_ :: Number -> Attribute
azimuth_ = attribute_ "azimuth"

bias_ :: Number -> Attribute
bias_ = attribute_ "bias"

diffuseConstant_ :: Number -> Attribute
diffuseConstant_ = attribute_ "diffuseConstant"

divisor_ :: Number -> Attribute
divisor_ = attribute_ "divisor"

elevation_ :: Number -> Attribute
elevation_ = attribute_ "elevation"

fr_ :: Number -> Attribute
fr_ = attribute_ "fr"

k1_ :: Number -> Attribute
k1_ = attribute_ "k1"

k2_ :: Number -> Attribute
k2_ = attribute_ "k2"

k3_ :: Number -> Attribute
k3_ = attribute_ "k3"

k4_ :: Number -> Attribute
k4_ = attribute_ "k4"

limitingConeAngle_ :: Number -> Attribute
limitingConeAngle_ = attribute_ "limitingConeAngle"

overlinePosition_ :: Number -> Attribute
overlinePosition_ = attribute_ "overline-position"

overlineThickness_ :: Number -> Attribute
overlineThickness_ = attribute_ "overline-thickness"

pathLength_ :: Number -> Attribute
pathLength_ = attribute_ "pathLength"

pointsAtX_ :: Number -> Attribute
pointsAtX_ = attribute_ "pointsAtX"

pointsAtY_ :: Number -> Attribute
pointsAtY_ = attribute_ "pointsAtY"

pointsAtZ_ :: Number -> Attribute
pointsAtZ_ = attribute_ "pointsAtZ"

refX_ :: Number -> Attribute
refX_ = attribute_ "refX"

refY_ :: Number -> Attribute
refY_ = attribute_ "refY"

scale_ :: Number -> Attribute
scale_ = attribute_ "scale"

seed_ :: Number -> Attribute
seed_ = attribute_ "seed"

specularConstant_ :: Number -> Attribute
specularConstant_ = attribute_ "specularConstant"

specularExponent_ :: Number -> Attribute
specularExponent_ = attribute_ "specularExponent"

strikethroughPosition_ :: Number -> Attribute
strikethroughPosition_ = attribute_ "strikethrough-position"

strikethroughThickness_ :: Number -> Attribute
strikethroughThickness_ = attribute_ "strikethrough-thickness"

strokeMiterlimit_ :: Number -> Attribute
strokeMiterlimit_ = attribute_ "stroke-miterlimit"

surfaceScale_ :: Number -> Attribute
surfaceScale_ = attribute_ "surfaceScale"

targetX_ :: Number -> Attribute
targetX_ = attribute_ "targetX"

targetY_ :: Number -> Attribute
targetY_ = attribute_ "targetY"

underlinePosition_ :: Number -> Attribute
underlinePosition_ = attribute_ "underline-position"

underlineThickness_ :: Number -> Attribute
underlineThickness_ = attribute_ "underline-thickness"

version_ :: Number -> Attribute
version_ = attribute_ "version"

cx_ :: String -> Attribute
cx_ = attribute_ "cx"

cy_ :: String -> Attribute
cy_ = attribute_ "cy"

fillOpacity_ :: String -> Attribute
fillOpacity_ = attribute_ "fill-opacity"

fx_ :: String -> Attribute
fx_ = attribute_ "fx"

fy_ :: String -> Attribute
fy_ = attribute_ "fy"

height_ :: String -> Attribute
height_ = attribute_ "height"

markerHeight_ :: String -> Attribute
markerHeight_ = attribute_ "markerHeight"

markerWidth_ :: String -> Attribute
markerWidth_ = attribute_ "markerWidth"

r_ :: String -> Attribute
r_ = attribute_ "r"

strokeDashoffset_ :: String -> Attribute
strokeDashoffset_ = attribute_ "stroke-dashoffset"

strokeOpacity_ :: String -> Attribute
strokeOpacity_ = attribute_ "stroke-opacity"

strokeWidth_ :: String -> Attribute
strokeWidth_ = attribute_ "stroke-width"

textLength_ :: String -> Attribute
textLength_ = attribute_ "textLength"

width_ :: String -> Attribute
width_ = attribute_ "width"

x_ :: String -> Attribute
x_ = attribute_ "x"

x1_ :: String -> Attribute
x1_ = attribute_ "x1"

x2_ :: String -> Attribute
x2_ = attribute_ "x2"

y_ :: String -> Attribute
y_ = attribute_ "y"

y1_ :: String -> Attribute
y1_ = attribute_ "y1"

y2_ :: String -> Attribute
y2_ = attribute_ "y2"

accumulate_ :: String -> Attribute
accumulate_ = attribute_ "accumulate"

additive_ :: String -> Attribute
additive_ = attribute_ "additive"

alignmentBaseline_ :: String -> Attribute
alignmentBaseline_ = attribute_ "alignment-baseline"

attributeName_ :: String -> Attribute
attributeName_ = attribute_ "attributeName"

attributeType_ :: String -> Attribute
attributeType_ = attribute_ "attributeType"

baseFrequency_ :: String -> Attribute
baseFrequency_ = attribute_ "baseFrequency"

baselineShift_ :: String -> Attribute
baselineShift_ = attribute_ "baseline-shift"

baseProfile_ :: String -> Attribute
baseProfile_ = attribute_ "baseProfile"

begin_ :: String -> Attribute
begin_ = attribute_ "begin"

calcMode_ :: String -> Attribute
calcMode_ = attribute_ "calcMode"

class_ :: String -> Attribute
class_ = attribute_ "class"

clipPathUnits_ :: String -> Attribute
clipPathUnits_ = attribute_ "clipPathUnits"

clipPath_ :: String -> Attribute
clipPath_ = attribute_ "clip-path"

clipRule_ :: String -> Attribute
clipRule_ = attribute_ "clip-rule"

color_ :: String -> Attribute
color_ = attribute_ "color"

colorInterpolation_ :: String -> Attribute
colorInterpolation_ = attribute_ "color-interpolation"

colorInterpolationFilters_ :: String -> Attribute
colorInterpolationFilters_ = attribute_ "color-interpolation-filters"

colorProfile_ :: String -> Attribute
colorProfile_ = attribute_ "color-profile"

colorRendering_ :: String -> Attribute
colorRendering_ = attribute_ "color-rendering"

contentScriptType_ :: String -> Attribute
contentScriptType_ = attribute_ "contentScriptType"

contentStyleType_ :: String -> Attribute
contentStyleType_ = attribute_ "contentStyleType"

cursor_ :: String -> Attribute
cursor_ = attribute_ "cursor"

d_ :: String -> Attribute
d_ = attribute_ "d"

direction_ :: String -> Attribute
direction_ = attribute_ "direction"

display_ :: String -> Attribute
display_ = attribute_ "display"

dominantBaseline_ :: String -> Attribute
dominantBaseline_ = attribute_ "dominant-baseline"

dur_ :: String -> Attribute
dur_ = attribute_ "dur"

dx_ :: String -> Attribute
dx_ = attribute_ "dx"

dy_ :: String -> Attribute
dy_ = attribute_ "dy"

edgeMode_ :: String -> Attribute
edgeMode_ = attribute_ "edgeMode"

end_ :: String -> Attribute
end_ = attribute_ "end"

fill_ :: String -> Attribute
fill_ = attribute_ "fill"

fillRule_ :: String -> Attribute
fillRule_ = attribute_ "fill-rule"

filter_ :: String -> Attribute
filter_ = attribute_ "filter"

filterUnits_ :: String -> Attribute
filterUnits_ = attribute_ "filterUnits"

floodColor_ :: String -> Attribute
floodColor_ = attribute_ "flood-color"

floodOpacity_ :: String -> Attribute
floodOpacity_ = attribute_ "flood-opacity"

fontFamily_ :: String -> Attribute
fontFamily_ = attribute_ "font-family"

fontSize_ :: String -> Attribute
fontSize_ = attribute_ "font-size"

fontSizeAdjust_ :: String -> Attribute
fontSizeAdjust_ = attribute_ "font-size-adjust"

fontStretch_ :: String -> Attribute
fontStretch_ = attribute_ "font-stretch"

fontStyle_ :: String -> Attribute
fontStyle_ = attribute_ "font-style"

fontVariant_ :: String -> Attribute
fontVariant_ = attribute_ "font-variant"

fontWeight_ :: String -> Attribute
fontWeight_ = attribute_ "font-weight"

from_ :: String -> Attribute
from_ = attribute_ "from"

gradientTransform_ :: String -> Attribute
gradientTransform_ = attribute_ "gradientTransform"

gradientUnits_ :: String -> Attribute
gradientUnits_ = attribute_ "gradientUnits"

href_ :: String -> Attribute
href_ = attribute_ "href"

imageRendering_ :: String -> Attribute
imageRendering_ = attribute_ "image-rendering"

in_ :: String -> Attribute
in_ = attribute_ "in"

in2_ :: String -> Attribute
in2_ = attribute_ "in2"

kernelMatrix_ :: String -> Attribute
kernelMatrix_ = attribute_ "kernelMatrix"

kernelUnitLength_ :: String -> Attribute
kernelUnitLength_ = attribute_ "kernelUnitLength"

kerning_ :: String -> Attribute
kerning_ = attribute_ "kerning"

keySplines_ :: String -> Attribute
keySplines_ = attribute_ "keySplines"

keyTimes_ :: String -> Attribute
keyTimes_ = attribute_ "keyTimes"

lengthAdjust_ :: String -> Attribute
lengthAdjust_ = attribute_ "lengthAdjust"

letterSpacing_ :: String -> Attribute
letterSpacing_ = attribute_ "letter-spacing"

lightingColor_ :: String -> Attribute
lightingColor_ = attribute_ "lighting-color"

local_ :: String -> Attribute
local_ = attribute_ "local"

markerEnd_ :: String -> Attribute
markerEnd_ = attribute_ "marker-end"

markerMid_ :: String -> Attribute
markerMid_ = attribute_ "marker-mid"

markerStart_ :: String -> Attribute
markerStart_ = attribute_ "marker-start"

markerUnits_ :: String -> Attribute
markerUnits_ = attribute_ "markerUnits"

mask_ :: String -> Attribute
mask_ = attribute_ "mask"

maskContentUnits_ :: String -> Attribute
maskContentUnits_ = attribute_ "maskContentUnits"

maskUnits_ :: String -> Attribute
maskUnits_ = attribute_ "maskUnits"

max_ :: String -> Attribute
max_ = attribute_ "max"

min_ :: String -> Attribute
min_ = attribute_ "min"

mode_ :: String -> Attribute
mode_ = attribute_ "mode"

opacity_ :: String -> Attribute
opacity_ = attribute_ "opacity"

operator_ :: String -> Attribute
operator_ = attribute_ "operator"

order_ :: String -> Attribute
order_ = attribute_ "order"

overflow_ :: String -> Attribute
overflow_ = attribute_ "overflow"

paintOrder_ :: String -> Attribute
paintOrder_ = attribute_ "paint-order"

patternContentUnits_ :: String -> Attribute
patternContentUnits_ = attribute_ "patternContentUnits"

patternTransform_ :: String -> Attribute
patternTransform_ = attribute_ "patternTransform"

patternUnits_ :: String -> Attribute
patternUnits_ = attribute_ "patternUnits"

pointerEvents_ :: String -> Attribute
pointerEvents_ = attribute_ "pointer-events"

points_ :: String -> Attribute
points_ = attribute_ "points"

preserveAspectRatio_ :: String -> Attribute
preserveAspectRatio_ = attribute_ "preserveAspectRatio"

primitiveUnits_ :: String -> Attribute
primitiveUnits_ = attribute_ "primitiveUnits"

radius_ :: String -> Attribute
radius_ = attribute_ "radius"

repeatCount_ :: String -> Attribute
repeatCount_ = attribute_ "repeatCount"

repeatDur_ :: String -> Attribute
repeatDur_ = attribute_ "repeatDur"

requiredFeatures_ :: String -> Attribute
requiredFeatures_ = attribute_ "requiredFeatures"

restart_ :: String -> Attribute
restart_ = attribute_ "restart"

result_ :: String -> Attribute
result_ = attribute_ "result"

rx_ :: String -> Attribute
rx_ = attribute_ "rx"

ry_ :: String -> Attribute
ry_ = attribute_ "ry"

shapeRendering_ :: String -> Attribute
shapeRendering_ = attribute_ "shape-rendering"

stdDeviation_ :: String -> Attribute
stdDeviation_ = attribute_ "stdDeviation"

stitchTiles_ :: String -> Attribute
stitchTiles_ = attribute_ "stitchTiles"

stopColor_ :: String -> Attribute
stopColor_ = attribute_ "stop-color"

stopOpacity_ :: String -> Attribute
stopOpacity_ = attribute_ "stop-opacity"

stroke_ :: String -> Attribute
stroke_ = attribute_ "stroke"

strokeDasharray_ :: String -> Attribute
strokeDasharray_ = attribute_ "stroke-dasharray"

strokeLinecap_ :: String -> Attribute
strokeLinecap_ = attribute_ "stroke-linecap"

strokeLinejoin_ :: String -> Attribute
strokeLinejoin_ = attribute_ "stroke-linejoin"

style_ :: String -> Attribute
style_ = attribute_ "style"

textAnchor_ :: String -> Attribute
textAnchor_ = attribute_ "text-anchor"

textDecoration_ :: String -> Attribute
textDecoration_ = attribute_ "text-decoration"

textRendering_ :: String -> Attribute
textRendering_ = attribute_ "text-rendering"

to_ :: String -> Attribute
to_ = attribute_ "to"

transform_ :: String -> Attribute
transform_ = attribute_ "transform"

type_ :: String -> Attribute
type_ = attribute_ "type"

values_ :: String -> Attribute
values_ = attribute_ "values"

vectorEffect_ :: String -> Attribute
vectorEffect_ = attribute_ "vector-effect"

viewBox_ :: String -> Attribute
viewBox_ = attribute_ "viewBox"

visibility_ :: String -> Attribute
visibility_ = attribute_ "visibility"

wordSpacing_ :: String -> Attribute
wordSpacing_ = attribute_ "word-spacing"

writingMode_ :: String -> Attribute
writingMode_ = attribute_ "writing-mode"

xChannelSelector_ :: String -> Attribute
xChannelSelector_ = attribute_ "xChannelSelector"

yChannelSelector_ :: String -> Attribute
yChannelSelector_ = attribute_ "yChannelSelector"

