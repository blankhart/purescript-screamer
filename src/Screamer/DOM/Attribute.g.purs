module Screamer.DOM.Attribute where

import Screamer.Core (Attribute, attribute_, class IsValue)

abbr_ :: String -> Attribute
abbr_ = attribute_ "abbr"

accept_ :: String -> Attribute
accept_ = attribute_ "accept"

accept_charset_ :: String -> Attribute
accept_charset_ = attribute_ "accept_charset"

accesskey_ :: String -> Attribute
accesskey_ = attribute_ "accesskey"

action_ :: String -> Attribute
action_ = attribute_ "action"

allow_ :: String -> Attribute
allow_ = attribute_ "allow"

allowfullscreen_ :: Boolean -> Attribute
allowfullscreen_ = attribute_ "allowfullscreen"

allowpaymentrequest_ :: Boolean -> Attribute
allowpaymentrequest_ = attribute_ "allowpaymentrequest"

alt_ :: String -> Attribute
alt_ = attribute_ "alt"

as_ :: String -> Attribute
as_ = attribute_ "as"

async_ :: Boolean -> Attribute
async_ = attribute_ "async"

autocapitalize_ :: String -> Attribute
autocapitalize_ = attribute_ "autocapitalize"

autocomplete_ :: Boolean -> Attribute
autocomplete_ = attribute_ "autocomplete"

autofocus_ :: Boolean -> Attribute
autofocus_ = attribute_ "autofocus"

autoplay_ :: Boolean -> Attribute
autoplay_ = attribute_ "autoplay"

charset_ :: String -> Attribute
charset_ = attribute_ "charset"

checked_ :: Boolean -> Attribute
checked_ = attribute_ "checked"

cite_ :: String -> Attribute
cite_ = attribute_ "cite"

class_ :: forall v . IsValue v => v -> Attribute
class_ = attribute_ "class"

color_ :: String -> Attribute
color_ = attribute_ "color"

cols_ :: Int -> Attribute
cols_ = attribute_ "cols"

colspan_ :: Int -> Attribute
colspan_ = attribute_ "colspan"

content_ :: String -> Attribute
content_ = attribute_ "content"

contenteditable_ :: Boolean -> Attribute
contenteditable_ = attribute_ "contenteditable"

controls_ :: Boolean -> Attribute
controls_ = attribute_ "controls"

coords_ :: String -> Attribute
coords_ = attribute_ "coords"

crossorigin_ :: String -> Attribute
crossorigin_ = attribute_ "crossorigin"

data_ :: String -> Attribute
data_ = attribute_ "data"

datetime_ :: String -> Attribute
datetime_ = attribute_ "datetime"

decoding_ :: String -> Attribute
decoding_ = attribute_ "decoding"

default_ :: Boolean -> Attribute
default_ = attribute_ "default"

defer_ :: Boolean -> Attribute
defer_ = attribute_ "defer"

dir_ :: String -> Attribute
dir_ = attribute_ "dir"

dirname_ :: String -> Attribute
dirname_ = attribute_ "dirname"

disabled_ :: Boolean -> Attribute
disabled_ = attribute_ "disabled"

download_ :: String -> Attribute
download_ = attribute_ "download"

draggable_ :: Boolean -> Attribute
draggable_ = attribute_ "draggable"

enctype_ :: String -> Attribute
enctype_ = attribute_ "enctype"

enterkeyhint_ :: String -> Attribute
enterkeyhint_ = attribute_ "enterkeyhint"

for_ :: String -> Attribute
for_ = attribute_ "for"

form_ :: String -> Attribute
form_ = attribute_ "form"

formaction_ :: String -> Attribute
formaction_ = attribute_ "formaction"

formenctype_ :: String -> Attribute
formenctype_ = attribute_ "formenctype"

formmethod_ :: String -> Attribute
formmethod_ = attribute_ "formmethod"

formnovalidate_ :: Boolean -> Attribute
formnovalidate_ = attribute_ "formnovalidate"

formtarget_ :: String -> Attribute
formtarget_ = attribute_ "formtarget"

headers_ :: String -> Attribute
headers_ = attribute_ "headers"

height_ :: String -> Attribute
height_ = attribute_ "height"

hidden_ :: Boolean -> Attribute
hidden_ = attribute_ "hidden"

high_ :: Number -> Attribute
high_ = attribute_ "high"

href_ :: String -> Attribute
href_ = attribute_ "href"

hreflang_ :: String -> Attribute
hreflang_ = attribute_ "hreflang"

http_equiv_ :: String -> Attribute
http_equiv_ = attribute_ "http_equiv"

id_ :: String -> Attribute
id_ = attribute_ "id"

inputmode_ :: String -> Attribute
inputmode_ = attribute_ "inputmode"

integrity_ :: String -> Attribute
integrity_ = attribute_ "integrity"

is_ :: String -> Attribute
is_ = attribute_ "is"

ismap_ :: Boolean -> Attribute
ismap_ = attribute_ "ismap"

itemid_ :: String -> Attribute
itemid_ = attribute_ "itemid"

itemprop_ :: String -> Attribute
itemprop_ = attribute_ "itemprop"

itemref_ :: String -> Attribute
itemref_ = attribute_ "itemref"

itemscope_ :: Boolean -> Attribute
itemscope_ = attribute_ "itemscope"

itemtype_ :: String -> Attribute
itemtype_ = attribute_ "itemtype"

kind_ :: String -> Attribute
kind_ = attribute_ "kind"

label_ :: String -> Attribute
label_ = attribute_ "label"

lang_ :: String -> Attribute
lang_ = attribute_ "lang"

list_ :: String -> Attribute
list_ = attribute_ "list"

loop_ :: Boolean -> Attribute
loop_ = attribute_ "loop"

low_ :: Number -> Attribute
low_ = attribute_ "low"

manifest_ :: String -> Attribute
manifest_ = attribute_ "manifest"

max_ :: Number -> Attribute
max_ = attribute_ "max"

maxlength_ :: String -> Attribute
maxlength_ = attribute_ "maxlength"

media_ :: String -> Attribute
media_ = attribute_ "media"

method_ :: String -> Attribute
method_ = attribute_ "method"

min_ :: Number -> Attribute
min_ = attribute_ "min"

minlength_ :: Int -> Attribute
minlength_ = attribute_ "minlength"

multiple_ :: Boolean -> Attribute
multiple_ = attribute_ "multiple"

muted_ :: Boolean -> Attribute
muted_ = attribute_ "muted"

name_ :: String -> Attribute
name_ = attribute_ "name"

nomodule_ :: Boolean -> Attribute
nomodule_ = attribute_ "nomodule"

nonce_ :: String -> Attribute
nonce_ = attribute_ "nonce"

novalidate_ :: Boolean -> Attribute
novalidate_ = attribute_ "novalidate"

open_ :: Boolean -> Attribute
open_ = attribute_ "open"

optimum_ :: Number -> Attribute
optimum_ = attribute_ "optimum"

pattern_ :: String -> Attribute
pattern_ = attribute_ "pattern"

ping_ :: String -> Attribute
ping_ = attribute_ "ping"

placeholder_ :: String -> Attribute
placeholder_ = attribute_ "placeholder"

playsinline_ :: Boolean -> Attribute
playsinline_ = attribute_ "playsinline"

poster_ :: String -> Attribute
poster_ = attribute_ "poster"

preload_ :: String -> Attribute
preload_ = attribute_ "preload"

readonly_ :: Boolean -> Attribute
readonly_ = attribute_ "readonly"

referrerpolicy_ :: String -> Attribute
referrerpolicy_ = attribute_ "referrerpolicy"

rel_ :: String -> Attribute
rel_ = attribute_ "rel"

required_ :: Boolean -> Attribute
required_ = attribute_ "required"

reversed_ :: Boolean -> Attribute
reversed_ = attribute_ "reversed"

rows_ :: Int -> Attribute
rows_ = attribute_ "rows"

rowspan_ :: Int -> Attribute
rowspan_ = attribute_ "rowspan"

sandbox_ :: String -> Attribute
sandbox_ = attribute_ "sandbox"

scope_ :: String -> Attribute
scope_ = attribute_ "scope"

selected_ :: Boolean -> Attribute
selected_ = attribute_ "selected"

shape_ :: String -> Attribute
shape_ = attribute_ "shape"

size_ :: Int -> Attribute
size_ = attribute_ "size"

sizes_ :: String -> Attribute
sizes_ = attribute_ "sizes"

slot_ :: String -> Attribute
slot_ = attribute_ "slot"

spellcheck_ :: Boolean -> Attribute
spellcheck_ = attribute_ "spellcheck"

src_ :: String -> Attribute
src_ = attribute_ "src"

srcdoc_ :: String -> Attribute
srcdoc_ = attribute_ "srcdoc"

srclang_ :: String -> Attribute
srclang_ = attribute_ "srclang"

srcset_ :: String -> Attribute
srcset_ = attribute_ "srcset"

start_ :: Int -> Attribute
start_ = attribute_ "start"

step_ :: Number -> Attribute
step_ = attribute_ "step"

tabindex_ :: Int -> Attribute
tabindex_ = attribute_ "tabindex"

target_ :: String -> Attribute
target_ = attribute_ "target"

title_ :: String -> Attribute
title_ = attribute_ "title"

translate_ :: Boolean -> Attribute
translate_ = attribute_ "translate"

type_ :: String -> Attribute
type_ = attribute_ "type"

typemustmatch_ :: Boolean -> Attribute
typemustmatch_ = attribute_ "typemustmatch"

usemap_ :: String -> Attribute
usemap_ = attribute_ "usemap"

value_ :: String -> Attribute
value_ = attribute_ "value"

width_ :: Int -> Attribute
width_ = attribute_ "width"

wrap_ :: String -> Attribute
wrap_ = attribute_ "wrap"

style_ :: forall a . IsValue a => a -> Attribute
style_ = attribute_ "style"
