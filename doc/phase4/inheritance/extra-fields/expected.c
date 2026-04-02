#include "runtime.h"

typedef struct { String name; } Animal;
typedef struct { Animal _base; String breed; } Dog;

int main(void) {
    TSC_INIT();
    Dog d = {0};
    d._base.name = STR_LIT("Rex");
    d.breed = STR_LIT("Labrador");
    printf("%s\n", d._base.name.data);
    printf("%s\n", d.breed.data);
    return 0;
}
