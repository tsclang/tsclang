#include "runtime.h"

typedef struct { TscError _base; } ParseError;
static ParseError ParseError_new(String msg) { ParseError s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int32_t value; ParseError error; }; } Result_i32_ParseError;

Result_i32_ParseError parse_string(String s) {
    if (tsc_string_eq(s, STR_LIT("bad"))) {
        return (Result_i32_ParseError){.ok = false, .error = ParseError_new(STR_LIT("invalid input"))};
    }
    return (Result_i32_ParseError){.ok = true, .value = 0};
}

int main(void) {
    TSC_INIT();
    return 0;
}
