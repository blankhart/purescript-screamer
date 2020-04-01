{ sources =
    [ "src/**/*.purs", "examples/**/*.purs" ]
, name =
    "screamer"
, dependencies =
    [ "aff"
    , "affjax"
    , "console"
    , "debug"
    , "effect"
    , "foreign"
    , "freet"
    , "generics-rep"
    , "newtype"
    , "nullable"
    , "prelude"
    , "random"
    , "refs"
    , "psci-support"
    , "random"
    , "transformers"
    , "web-events"
    , "web-dom"
    , "web-html"
    , "web-socket"
    , "web-uievents"
    , "windrose-router"
    ]
, packages =
    ./packages.dhall
}
