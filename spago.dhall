{ sources =
    [ "src/**/*.purs", "examples/**/*.purs" ]
, name =
    "screamer"
, dependencies =
    [ "aff"
    , "affjax"
    , "console"
    , "effect"
    , "foreign"
    , "generics-rep"
    , "nullable"
    , "prelude"
    , "random"
    , "refs"
    , "psci-support"
    , "random"
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
