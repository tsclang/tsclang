#include "runtime.h"

static const String prefix;

static String _lambda_0_string(void *_env, String name) {
    return tsc_string_concat_n((String[]){ prefix, STR_LIT(", "), name }, 3);
}

static const String prefix = STR_LIT("Hello");

int main(void) {
    TSC_INIT();
    tsc_closure greet = {.env = NULL, .fn = (void*)_lambda_0_string};
    printf("%s\n", ((String (*)(void *, String))greet.fn)(greet.env, STR_LIT("World")).data);
    tsc_string_release(prefix);
    return 0;
}
