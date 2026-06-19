#include "runtime.h"

void greet_inner_string(String name) {
    printf("%s\n", name.data);
}

static void greet_string(String name) {
    printf("before\n");
    greet_inner_string(name);
    printf("after\n");
}

int main(void) {
    TSC_INIT();
    greet_string(STR_LIT("Alice"));
    return 0;
}
