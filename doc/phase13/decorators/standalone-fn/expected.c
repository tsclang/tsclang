#include "runtime.h"

static void greet_inner_string(String name) {
    printf("%s\n", name.data);
}

static void greet_string(String name) {
    printf("%s\n", "before");
    greet_inner_string(name);
    printf("%s\n", "after");
}

int main(void) {
    TSC_INIT();
    greet_string(STR_LIT("Alice"));
    return 0;
}
