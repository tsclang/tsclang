#include "runtime.h"

static String name;

static String _lambda_0_string(void *_env) {
    return name;
}

static String name = STR_LIT("aaa");

void setName(void) {
    { String _tsc_tmp = STR_LIT("bbb"); tsc_string_release(name); name = _tsc_tmp; }
}

int main(void) {
    TSC_INIT();
    tsc_closure get = {.env = NULL, .fn = (void*)_lambda_0_string};
    printf("%s\n", ((String (*)(void *))get.fn)(get.env).data);
    setName();
    printf("%s\n", ((String (*)(void *))get.fn)(get.env).data);
    tsc_string_release(name);
    return 0;
}
