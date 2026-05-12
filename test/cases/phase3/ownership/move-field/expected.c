#include "runtime.h"

typedef struct { String name; } Owner;

int main(void) {
    TSC_INIT();
    Owner o = {0};
    o.name = STR_LIT("Alice");
    String n = o.name;
    printf("%s\n", n.data);
    return 0;
}
