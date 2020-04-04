module Screamer.DOM.Svg where

import Screamer.Core (Element, svg_)

a_ :: Array Attribute -> Array Element -> Element
a_ = svg_ "a"

animate_ :: Array Attribute -> Array Element -> Element
animate_ = svg_ "animate"

animateMotion_ :: Array Attribute -> Array Element -> Element
animateMotion_ = svg_ "animateMotion"

animateTransform_ :: Array Attribute -> Array Element -> Element
animateTransform_ = svg_ "animateTransform"

circle_ :: Array Attribute -> Array Element -> Element
circle_ = svg_ "circle"

clipPath_ :: Array Attribute -> Array Element -> Element
clipPath_ = svg_ "clipPath"

colorProfile_ :: Array Attribute -> Array Element -> Element
colorProfile_ = svg_ "color-profile"

defs_ :: Array Attribute -> Array Element -> Element
defs_ = svg_ "defs"

desc_ :: Array Attribute -> Array Element -> Element
desc_ = svg_ "desc"

discard_ :: Array Attribute -> Array Element -> Element
discard_ = svg_ "discard"

ellipse_ :: Array Attribute -> Array Element -> Element
ellipse_ = svg_ "ellipse"

feBlend_ :: Array Attribute -> Array Element -> Element
feBlend_ = svg_ "feBlend"

feColorMatrix_ :: Array Attribute -> Array Element -> Element
feColorMatrix_ = svg_ "feColorMatrix"

feComponentTransfer_ :: Array Attribute -> Array Element -> Element
feComponentTransfer_ = svg_ "feComponentTransfer"

feComposite_ :: Array Attribute -> Array Element -> Element
feComposite_ = svg_ "feComposite"

feConvolveMatrix_ :: Array Attribute -> Array Element -> Element
feConvolveMatrix_ = svg_ "feConvolveMatrix"

feDiffuseLighting_ :: Array Attribute -> Array Element -> Element
feDiffuseLighting_ = svg_ "feDiffuseLighting"

feDisplacementMap_ :: Array Attribute -> Array Element -> Element
feDisplacementMap_ = svg_ "feDisplacementMap"

feDistantLight_ :: Array Attribute -> Array Element -> Element
feDistantLight_ = svg_ "feDistantLight"

feDropShadow_ :: Array Attribute -> Array Element -> Element
feDropShadow_ = svg_ "feDropShadow"

feFlood_ :: Array Attribute -> Array Element -> Element
feFlood_ = svg_ "feFlood"

feFuncA_ :: Array Attribute -> Array Element -> Element
feFuncA_ = svg_ "feFuncA"

feFuncB_ :: Array Attribute -> Array Element -> Element
feFuncB_ = svg_ "feFuncB"

feFuncG_ :: Array Attribute -> Array Element -> Element
feFuncG_ = svg_ "feFuncG"

feFuncR_ :: Array Attribute -> Array Element -> Element
feFuncR_ = svg_ "feFuncR"

feGaussianBlur_ :: Array Attribute -> Array Element -> Element
feGaussianBlur_ = svg_ "feGaussianBlur"

feImage_ :: Array Attribute -> Array Element -> Element
feImage_ = svg_ "feImage"

feMerge_ :: Array Attribute -> Array Element -> Element
feMerge_ = svg_ "feMerge"

feMergeNode_ :: Array Attribute -> Array Element -> Element
feMergeNode_ = svg_ "feMergeNode"

feMorphology_ :: Array Attribute -> Array Element -> Element
feMorphology_ = svg_ "feMorphology"

feOffset_ :: Array Attribute -> Array Element -> Element
feOffset_ = svg_ "feOffset"

fePointLight_ :: Array Attribute -> Array Element -> Element
fePointLight_ = svg_ "fePointLight"

feSpecularLighting_ :: Array Attribute -> Array Element -> Element
feSpecularLighting_ = svg_ "feSpecularLighting"

feSpotLight_ :: Array Attribute -> Array Element -> Element
feSpotLight_ = svg_ "feSpotLight"

feTile_ :: Array Attribute -> Array Element -> Element
feTile_ = svg_ "feTile"

feTurbulence_ :: Array Attribute -> Array Element -> Element
feTurbulence_ = svg_ "feTurbulence"

filter_ :: Array Attribute -> Array Element -> Element
filter_ = svg_ "filter"

foreignObject_ :: Array Attribute -> Array Element -> Element
foreignObject_ = svg_ "foreignObject"

g_ :: Array Attribute -> Array Element -> Element
g_ = svg_ "g"

hatch_ :: Array Attribute -> Array Element -> Element
hatch_ = svg_ "hatch"

hatchpath_ :: Array Attribute -> Array Element -> Element
hatchpath_ = svg_ "hatchpath"

image_ :: Array Attribute -> Array Element -> Element
image_ = svg_ "image"

line_ :: Array Attribute -> Array Element -> Element
line_ = svg_ "line"

linearGradient_ :: Array Attribute -> Array Element -> Element
linearGradient_ = svg_ "linearGradient"

marker_ :: Array Attribute -> Array Element -> Element
marker_ = svg_ "marker"

mask_ :: Array Attribute -> Array Element -> Element
mask_ = svg_ "mask"

mesh_ :: Array Attribute -> Array Element -> Element
mesh_ = svg_ "mesh"

meshgradient_ :: Array Attribute -> Array Element -> Element
meshgradient_ = svg_ "meshgradient"

meshpatch_ :: Array Attribute -> Array Element -> Element
meshpatch_ = svg_ "meshpatch"

meshrow_ :: Array Attribute -> Array Element -> Element
meshrow_ = svg_ "meshrow"

metadata_ :: Array Attribute -> Array Element -> Element
metadata_ = svg_ "metadata"

mpath_ :: Array Attribute -> Array Element -> Element
mpath_ = svg_ "mpath"

path_ :: Array Attribute -> Array Element -> Element
path_ = svg_ "path"

pattern_ :: Array Attribute -> Array Element -> Element
pattern_ = svg_ "pattern"

polygon_ :: Array Attribute -> Array Element -> Element
polygon_ = svg_ "polygon"

polyline_ :: Array Attribute -> Array Element -> Element
polyline_ = svg_ "polyline"

radialGradient_ :: Array Attribute -> Array Element -> Element
radialGradient_ = svg_ "radialGradient"

rect_ :: Array Attribute -> Array Element -> Element
rect_ = svg_ "rect"

script_ :: Array Attribute -> Array Element -> Element
script_ = svg_ "script"

set_ :: Array Attribute -> Array Element -> Element
set_ = svg_ "set"

solidcolor_ :: Array Attribute -> Array Element -> Element
solidcolor_ = svg_ "solidcolor"

stop_ :: Array Attribute -> Array Element -> Element
stop_ = svg_ "stop"

style_ :: Array Attribute -> Array Element -> Element
style_ = svg_ "style"

svg_ :: Array Attribute -> Array Element -> Element
svg_ = svg_ "svg"

switch_ :: Array Attribute -> Array Element -> Element
switch_ = svg_ "switch"

symbol_ :: Array Attribute -> Array Element -> Element
symbol_ = svg_ "symbol"

text_ :: Array Attribute -> Array Element -> Element
text_ = svg_ "text"

textPath_ :: Array Attribute -> Array Element -> Element
textPath_ = svg_ "textPath"

title_ :: Array Attribute -> Array Element -> Element
title_ = svg_ "title"

tspan_ :: Array Attribute -> Array Element -> Element
tspan_ = svg_ "tspan"

unknown_ :: Array Attribute -> Array Element -> Element
unknown_ = svg_ "unknown"

use_ :: Array Attribute -> Array Element -> Element
use_ = svg_ "use"

view_ :: Array Attribute -> Array Element -> Element
view_ = svg_ "view"


externalResourcesRequired_ :: Boolean -> Attribute
externalResourcesRequired_ = svg_ "externalResourcesRequired"

preserveAlpha_ :: Boolean -> Attribute
preserveAlpha_ = svg_ "preserveAlpha"

numOctaves_ :: Integer -> Attribute
numOctaves_ = svg_ "numOctaves"

tabindex_ :: Integer -> Attribute
tabindex_ = svg_ "tabindex"

accentHeight_ :: Number -> Attribute
accentHeight_ = svg_ "accent-height"

ascent_ :: Number -> Attribute
ascent_ = svg_ "ascent"

azimuth_ :: Number -> Attribute
azimuth_ = svg_ "azimuth"

bias_ :: Number -> Attribute
bias_ = svg_ "bias"

diffuseConstant_ :: Number -> Attribute
diffuseConstant_ = svg_ "diffuseConstant"

divisor_ :: Number -> Attribute
divisor_ = svg_ "divisor"

elevation_ :: Number -> Attribute
elevation_ = svg_ "elevation"

fr_ :: Number -> Attribute
fr_ = svg_ "fr"

k1_ :: Number -> Attribute
k1_ = svg_ "k1"

k2_ :: Number -> Attribute
k2_ = svg_ "k2"

k3_ :: Number -> Attribute
k3_ = svg_ "k3"

k4_ :: Number -> Attribute
k4_ = svg_ "k4"

limitingConeAngle_ :: Number -> Attribute
limitingConeAngle_ = svg_ "limitingConeAngle"

overlinePosition_ :: Number -> Attribute
overlinePosition_ = svg_ "overline-position"

overlineThickness_ :: Number -> Attribute
overlineThickness_ = svg_ "overline-thickness"

pathLength_ :: Number -> Attribute
pathLength_ = svg_ "pathLength"

pointsAtX_ :: Number -> Attribute
pointsAtX_ = svg_ "pointsAtX"

pointsAtY_ :: Number -> Attribute
pointsAtY_ = svg_ "pointsAtY"

pointsAtZ_ :: Number -> Attribute
pointsAtZ_ = svg_ "pointsAtZ"

refX_ :: Number -> Attribute
refX_ = svg_ "refX"

refY_ :: Number -> Attribute
refY_ = svg_ "refY"

scale_ :: Number -> Attribute
scale_ = svg_ "scale"

seed_ :: Number -> Attribute
seed_ = svg_ "seed"

specularConstant_ :: Number -> Attribute
specularConstant_ = svg_ "specularConstant"

specularExponent_ :: Number -> Attribute
specularExponent_ = svg_ "specularExponent"

strikethroughPosition_ :: Number -> Attribute
strikethroughPosition_ = svg_ "strikethrough-position"

strikethroughThickness_ :: Number -> Attribute
strikethroughThickness_ = svg_ "strikethrough-thickness"

strokeMiterlimit_ :: Number -> Attribute
strokeMiterlimit_ = svg_ "stroke-miterlimit"

surfaceScale_ :: Number -> Attribute
surfaceScale_ = svg_ "surfaceScale"

targetX_ :: Number -> Attribute
targetX_ = svg_ "targetX"

targetY_ :: Number -> Attribute
targetY_ = svg_ "targetY"

underlinePosition_ :: Number -> Attribute
underlinePosition_ = svg_ "underline-position"

underlineThickness_ :: Number -> Attribute
underlineThickness_ = svg_ "underline-thickness"

version_ :: Number -> Attribute
version_ = svg_ "version"

cx_ :: String -> Attribute
cx_ = svg_ "cx"

cy_ :: String -> Attribute
cy_ = svg_ "cy"

fillOpacity_ :: String -> Attribute
fillOpacity_ = svg_ "fill-opacity"

fx_ :: String -> Attribute
fx_ = svg_ "fx"

fy_ :: String -> Attribute
fy_ = svg_ "fy"

height_ :: String -> Attribute
height_ = svg_ "height"

markerHeight_ :: String -> Attribute
markerHeight_ = svg_ "markerHeight"

markerWidth_ :: String -> Attribute
markerWidth_ = svg_ "markerWidth"

r_ :: String -> Attribute
r_ = svg_ "r"

strokeDashoffset_ :: String -> Attribute
strokeDashoffset_ = svg_ "stroke-dashoffset"

strokeOpacity_ :: String -> Attribute
strokeOpacity_ = svg_ "stroke-opacity"

strokeWidth_ :: String -> Attribute
strokeWidth_ = svg_ "stroke-width"

textLength_ :: String -> Attribute
textLength_ = svg_ "textLength"

width_ :: String -> Attribute
width_ = svg_ "width"

x_ :: String -> Attribute
x_ = svg_ "x"

x1_ :: String -> Attribute
x1_ = svg_ "x1"

x2_ :: String -> Attribute
x2_ = svg_ "x2"

y_ :: String -> Attribute
y_ = svg_ "y"

y1_ :: String -> Attribute
y1_ = svg_ "y1"

y2_ :: String -> Attribute
y2_ = svg_ "y2"

accumulate_ :: String -> Attribute
accumulate_ = svg_ "accumulate"

additive_ :: String -> Attribute
additive_ = svg_ "additive"

alignmentBaseline_ :: String -> Attribute
alignmentBaseline_ = svg_ "alignment-baseline"

attributeName_ :: String -> Attribute
attributeName_ = svg_ "attributeName"

attributeType_ :: String -> Attribute
attributeType_ = svg_ "attributeType"

baseFrequency_ :: String -> Attribute
baseFrequency_ = svg_ "baseFrequency"

baselineShift_ :: String -> Attribute
baselineShift_ = svg_ "baseline-shift"

baseProfile_ :: String -> Attribute
baseProfile_ = svg_ "baseProfile"

begin_ :: String -> Attribute
begin_ = svg_ "begin"

calcMode_ :: String -> Attribute
calcMode_ = svg_ "calcMode"

class_ :: String -> Attribute
class_ = svg_ "class"

clipPathUnits_ :: String -> Attribute
clipPathUnits_ = svg_ "clipPathUnits"

clipPath_ :: String -> Attribute
clipPath_ = svg_ "clip-path"

clipRule_ :: String -> Attribute
clipRule_ = svg_ "clip-rule"

color_ :: String -> Attribute
color_ = svg_ "color"

colorInterpolation_ :: String -> Attribute
colorInterpolation_ = svg_ "color-interpolation"

colorInterpolationFilters_ :: String -> Attribute
colorInterpolationFilters_ = svg_ "color-interpolation-filters"

colorProfile_ :: String -> Attribute
colorProfile_ = svg_ "color-profile"

colorRendering_ :: String -> Attribute
colorRendering_ = svg_ "color-rendering"

contentScriptType_ :: String -> Attribute
contentScriptType_ = svg_ "contentScriptType"

contentStyleType_ :: String -> Attribute
contentStyleType_ = svg_ "contentStyleType"

cursor_ :: String -> Attribute
cursor_ = svg_ "cursor"

d_ :: String -> Attribute
d_ = svg_ "d"

direction_ :: String -> Attribute
direction_ = svg_ "direction"

display_ :: String -> Attribute
display_ = svg_ "display"

dominantBaseline_ :: String -> Attribute
dominantBaseline_ = svg_ "dominant-baseline"

dur_ :: String -> Attribute
dur_ = svg_ "dur"

dx_ :: String -> Attribute
dx_ = svg_ "dx"

dy_ :: String -> Attribute
dy_ = svg_ "dy"

edgeMode_ :: String -> Attribute
edgeMode_ = svg_ "edgeMode"

end_ :: String -> Attribute
end_ = svg_ "end"

fill_ :: String -> Attribute
fill_ = svg_ "fill"

fillRule_ :: String -> Attribute
fillRule_ = svg_ "fill-rule"

filter_ :: String -> Attribute
filter_ = svg_ "filter"

filterUnits_ :: String -> Attribute
filterUnits_ = svg_ "filterUnits"

floodColor_ :: String -> Attribute
floodColor_ = svg_ "flood-color"

floodOpacity_ :: String -> Attribute
floodOpacity_ = svg_ "flood-opacity"

fontFamily_ :: String -> Attribute
fontFamily_ = svg_ "font-family"

fontSize_ :: String -> Attribute
fontSize_ = svg_ "font-size"

fontSizeAdjust_ :: String -> Attribute
fontSizeAdjust_ = svg_ "font-size-adjust"

fontStretch_ :: String -> Attribute
fontStretch_ = svg_ "font-stretch"

fontStyle_ :: String -> Attribute
fontStyle_ = svg_ "font-style"

fontVariant_ :: String -> Attribute
fontVariant_ = svg_ "font-variant"

fontWeight_ :: String -> Attribute
fontWeight_ = svg_ "font-weight"

from_ :: String -> Attribute
from_ = svg_ "from"

gradientTransform_ :: String -> Attribute
gradientTransform_ = svg_ "gradientTransform"

gradientUnits_ :: String -> Attribute
gradientUnits_ = svg_ "gradientUnits"

href_ :: String -> Attribute
href_ = svg_ "href"

imageRendering_ :: String -> Attribute
imageRendering_ = svg_ "image-rendering"

in_ :: String -> Attribute
in_ = svg_ "in"

in2_ :: String -> Attribute
in2_ = svg_ "in2"

kernelMatrix_ :: String -> Attribute
kernelMatrix_ = svg_ "kernelMatrix"

kernelUnitLength_ :: String -> Attribute
kernelUnitLength_ = svg_ "kernelUnitLength"

kerning_ :: String -> Attribute
kerning_ = svg_ "kerning"

keySplines_ :: String -> Attribute
keySplines_ = svg_ "keySplines"

keyTimes_ :: String -> Attribute
keyTimes_ = svg_ "keyTimes"

lengthAdjust_ :: String -> Attribute
lengthAdjust_ = svg_ "lengthAdjust"

letterSpacing_ :: String -> Attribute
letterSpacing_ = svg_ "letter-spacing"

lightingColor_ :: String -> Attribute
lightingColor_ = svg_ "lighting-color"

local_ :: String -> Attribute
local_ = svg_ "local"

markerEnd_ :: String -> Attribute
markerEnd_ = svg_ "marker-end"

markerMid_ :: String -> Attribute
markerMid_ = svg_ "marker-mid"

markerStart_ :: String -> Attribute
markerStart_ = svg_ "marker-start"

markerUnits_ :: String -> Attribute
markerUnits_ = svg_ "markerUnits"

mask_ :: String -> Attribute
mask_ = svg_ "mask"

maskContentUnits_ :: String -> Attribute
maskContentUnits_ = svg_ "maskContentUnits"

maskUnits_ :: String -> Attribute
maskUnits_ = svg_ "maskUnits"

max_ :: String -> Attribute
max_ = svg_ "max"

min_ :: String -> Attribute
min_ = svg_ "min"

mode_ :: String -> Attribute
mode_ = svg_ "mode"

opacity_ :: String -> Attribute
opacity_ = svg_ "opacity"

operator_ :: String -> Attribute
operator_ = svg_ "operator"

order_ :: String -> Attribute
order_ = svg_ "order"

overflow_ :: String -> Attribute
overflow_ = svg_ "overflow"

paintOrder_ :: String -> Attribute
paintOrder_ = svg_ "paint-order"

patternContentUnits_ :: String -> Attribute
patternContentUnits_ = svg_ "patternContentUnits"

patternTransform_ :: String -> Attribute
patternTransform_ = svg_ "patternTransform"

patternUnits_ :: String -> Attribute
patternUnits_ = svg_ "patternUnits"

pointerEvents_ :: String -> Attribute
pointerEvents_ = svg_ "pointer-events"

points_ :: String -> Attribute
points_ = svg_ "points"

preserveAspectRatio_ :: String -> Attribute
preserveAspectRatio_ = svg_ "preserveAspectRatio"

primitiveUnits_ :: String -> Attribute
primitiveUnits_ = svg_ "primitiveUnits"

radius_ :: String -> Attribute
radius_ = svg_ "radius"

repeatCount_ :: String -> Attribute
repeatCount_ = svg_ "repeatCount"

repeatDur_ :: String -> Attribute
repeatDur_ = svg_ "repeatDur"

requiredFeatures_ :: String -> Attribute
requiredFeatures_ = svg_ "requiredFeatures"

restart_ :: String -> Attribute
restart_ = svg_ "restart"

result_ :: String -> Attribute
result_ = svg_ "result"

rx_ :: String -> Attribute
rx_ = svg_ "rx"

ry_ :: String -> Attribute
ry_ = svg_ "ry"

shapeRendering_ :: String -> Attribute
shapeRendering_ = svg_ "shape-rendering"

stdDeviation_ :: String -> Attribute
stdDeviation_ = svg_ "stdDeviation"

stitchTiles_ :: String -> Attribute
stitchTiles_ = svg_ "stitchTiles"

stopColor_ :: String -> Attribute
stopColor_ = svg_ "stop-color"

stopOpacity_ :: String -> Attribute
stopOpacity_ = svg_ "stop-opacity"

stroke_ :: String -> Attribute
stroke_ = svg_ "stroke"

strokeDasharray_ :: String -> Attribute
strokeDasharray_ = svg_ "stroke-dasharray"

strokeLinecap_ :: String -> Attribute
strokeLinecap_ = svg_ "stroke-linecap"

strokeLinejoin_ :: String -> Attribute
strokeLinejoin_ = svg_ "stroke-linejoin"

style_ :: String -> Attribute
style_ = svg_ "style"

textAnchor_ :: String -> Attribute
textAnchor_ = svg_ "text-anchor"

textDecoration_ :: String -> Attribute
textDecoration_ = svg_ "text-decoration"

textRendering_ :: String -> Attribute
textRendering_ = svg_ "text-rendering"

to_ :: String -> Attribute
to_ = svg_ "to"

transform_ :: String -> Attribute
transform_ = svg_ "transform"

type_ :: String -> Attribute
type_ = svg_ "type"

values_ :: String -> Attribute
values_ = svg_ "values"

vectorEffect_ :: String -> Attribute
vectorEffect_ = svg_ "vector-effect"

viewBox_ :: String -> Attribute
viewBox_ = svg_ "viewBox"

visibility_ :: String -> Attribute
visibility_ = svg_ "visibility"

wordSpacing_ :: String -> Attribute
wordSpacing_ = svg_ "word-spacing"

writingMode_ :: String -> Attribute
writingMode_ = svg_ "writing-mode"

xChannelSelector_ :: String -> Attribute
xChannelSelector_ = svg_ "xChannelSelector"

yChannelSelector_ :: String -> Attribute
yChannelSelector_ = svg_ "yChannelSelector"

